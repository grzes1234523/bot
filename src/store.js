import fs from 'node:fs/promises';
import path from 'node:path';
import { databaseEnabled, loadDocument, refreshDocument, updateDocument } from './database.js';

export class EligibilityError extends Error {
  constructor(code, application = null, remainingHours = 0) {
    super(code);
    this.code = code;
    this.application = application;
    this.remainingHours = remainingHours;
  }
}

/** Bez bazy SQL; zapis atomowy + serializacja wszystkich zmian. */
export class ApplicationStore {
  #file;
  #data = {};
  #queue = Promise.resolve();
  #database = false;
  #documentKey;

  constructor(filename, { documentKey = 'applications' } = {}) {
    this.#file = filename;
    if (!/^applications(?::\d{17,20})?$/.test(documentKey)) throw new Error('Nieprawidłowy klucz bazy podań.');
    this.#documentKey = documentKey;
  }

  async init() {
    await fs.mkdir(path.dirname(this.#file), { recursive: true });
    try {
      const contents = await fs.readFile(this.#file, 'utf8');
      const decoded = JSON.parse(contents);
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        throw new Error('applications.json powinien zawierać obiekt z podaniami.');
      }
      this.#data = decoded;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // nigdy nie nadpisuj uszkodzonego pliku
      await this.#write({});
      this.#data = {};
    }
    this.#database = await databaseEnabled();
    if (this.#database) this.#data = await loadDocument(this.#documentKey, this.#data);
  }

  get(id) {
    const value = this.#data[String(id ?? '').toUpperCase()];
    return value ? structuredClone(value) : null;
  }

  list() {
    return Object.values(this.#data).map(v => structuredClone(v))
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  }

  async refresh() {
    const task = this.#queue.then(async () => {
      if (this.#database) {
        const fresh = await refreshDocument(this.#documentKey);
        if (fresh) this.#data = fresh;
      }
      return this.list();
    });
    this.#queue = task.then(() => {}, () => {});
    return task;
  }

  latestByUser(userId) {
    return this.list().find(app => app.userId === userId) ?? null;
  }

  eligibility(userId, cooldownHours, now = Date.now(), state = this.#data) {
    const mine = Object.values(state).filter(app => app.userId === userId);
    const pending = mine.find(app => app.status === 'pending');
    if (pending) throw new EligibilityError('PENDING', pending);
    const newest = mine.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
    if (newest?.status === 'accepted') throw new EligibilityError('ACCEPTED', newest);
    if (newest && cooldownHours > 0) {
      const lastDecision = Date.parse(newest.decisionAt ?? newest.createdAt ?? '');
      const remaining = lastDecision + cooldownHours * 3600000 - now;
      if (Number.isFinite(remaining) && remaining > 0) {
        throw new EligibilityError('COOLDOWN', newest, Math.ceil(remaining / 3600000));
      }
    }
    return true;
  }

  async create(application, cooldownHours) {
    return this.#transact(draft => {
      this.eligibility(application.userId, cooldownHours, Date.now(), draft);
      if (draft[application.id]) throw new Error('Kolizja ID podania, spróbuj ponownie.');
      draft[application.id] = structuredClone(application);
      return structuredClone(application);
    });
  }

  async update(id, updater) {
    return this.#transact(draft => {
      const app = draft[id];
      if (!app) throw new Error(`Nie znaleziono podania ${id}.`);
      updater(app);
      return structuredClone(app);
    });
  }

  // Usuwa wyłącznie rozstrzygnięte zgłoszenia (nie pending).
  // Każde usunięcie jest poprzedzone kopią całej bazy w data/backups/.
  async deleteFinished({ id = null, status = 'all' } = {}) {
    if (!['all', 'accepted', 'rejected', 'closed'].includes(status)) {
      throw new Error('Nieprawidłowy filtr statusu.');
    }
    return this.#transact(async draft => {
      const finished = new Set(['accepted', 'rejected', 'closed']);
      const selected = Object.values(draft).filter(app =>
        (!id || app.id === id) && finished.has(app.status) && (status === 'all' || app.status === status));
      if (!selected.length) return { deleted: [], backupPath: null };
      const directory = path.join(path.dirname(this.#file), 'backups');
      await fs.mkdir(directory, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = path.join(directory, `applications-before-delete-${stamp}-${process.pid}-${Math.random().toString(36).slice(2, 9)}.json`);
      await fs.writeFile(filename, `${JSON.stringify(this.#data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      for (const app of selected) delete draft[app.id];
      return { deleted: selected.map(app => structuredClone(app)), backupPath: filename };
    });
  }

  async removeUnsent(id) {
    return this.#transact(draft => {
      const app = draft[id];
      if (app?.status === 'pending' && !app.reviewMessageId) delete draft[id];
      return !draft[id];
    });
  }

  async #transact(change) {
    const task = this.#queue.then(async () => {
      if (this.#database) {
        const updated = await updateDocument(this.#documentKey, this.#data, change);
        this.#data = updated.state;
        return updated.result;
      }
      const draft = structuredClone(this.#data);
      const result = await change(draft);
      await this.#write(draft);
      this.#data = draft; // opublikuj stan dopiero po trwałym zapisie
      return result;
    });
    this.#queue = task.then(() => {}, () => {}); // awaria nie blokuje kolejnych zapisów
    return task;
  }

  async #write(data) {
    const temporary = `${this.#file}.${process.pid}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      await fs.rename(temporary, this.#file);
    } catch (error) {
      await fs.unlink(temporary).catch(() => {});
      throw error;
    }
  }
}
