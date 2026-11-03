import { randomUUID } from 'node:crypto';
import { databaseEnabled, refreshDocument, updateDocument } from './database.js';

const MAX_AGE_MS = 45_000;
const MAX_CLOCK_SKEW_MS = 5_000;
const defaultStorage = { databaseEnabled, refreshDocument, updateDocument };
const status = (botStatus, botReady = null, botLastSeen = null) => ({ botReady, botStatus, botLastSeen });

/**
 * A small, independent runtime document shared by the worker and WWW panel.
 * Injected storage implements the three database.js helpers with their existing
 * signatures; updateDocument must lock the document and return { state, result }.
 */
export class WorkerStatus {
  #guildId;
  #clientId;
  #instanceId = randomUUID();
  #key;
  #now;
  #storage;
  #published = false;
  #stopped = false;
  #queue = Promise.resolve();

  constructor({ guildId, clientId, now = Date.now, storage = defaultStorage }) {
    this.#guildId = String(guildId ?? '').trim();
    this.#clientId = String(clientId ?? '').trim();
    if (!this.#guildId || !this.#clientId) throw new TypeError('Stan workera wymaga GUILD_ID i CLIENT_ID.');
    this.#key = `runtime:bot:${this.#guildId}:${this.#clientId}`;
    this.#now = now;
    this.#storage = storage;
  }

  publish({ ready, botId = null }) {
    if (typeof ready !== 'boolean') return Promise.reject(new TypeError('ready musi być wartością logiczną.'));
    return this.#enqueue(async () => {
      if (this.#stopped || !await this.#storage.databaseEnabled()) return false;
      const record = {
        guildId: this.#guildId, clientId: this.#clientId, instanceId: this.#instanceId,
        botId: botId == null ? null : String(botId).trim(), ready,
        lastSeen: new Date(this.#now()).toISOString(),
      };
      const updated = await this.#storage.updateDocument(this.#key, record, state => {
        // A newly started worker may claim the row once. An older worker that
        // already owned it must not reclaim it during an overlapping deploy.
        if (this.#published && state.instanceId !== this.#instanceId) return false;
        Object.assign(state, record);
        return true;
      });
      if (updated?.result !== true) return false;
      this.#published = true;
      return true;
    });
  }

  async read() {
    try {
      if (!await this.#storage.databaseEnabled()) return status('unknown');
      const record = await this.#storage.refreshDocument(this.#key);
      if (!record || typeof record !== 'object' || Array.isArray(record)) return status('unknown');
      const lastSeen = typeof record.lastSeen === 'string' ? Date.parse(record.lastSeen) : NaN;
      const validTimestamp = Number.isFinite(lastSeen) && lastSeen - this.#now() <= MAX_CLOCK_SKEW_MS;
      const seen = validTimestamp ? new Date(lastSeen).toISOString() : null;
      if (record.guildId !== this.#guildId || record.clientId !== this.#clientId ||
          (record.botId != null && record.botId !== this.#clientId) ||
          (record.ready === true && record.botId !== this.#clientId)) {
        return status('configuration_mismatch', null, seen);
      }
      if (!validTimestamp || typeof record.ready !== 'boolean' || typeof record.instanceId !== 'string' || !record.instanceId) return status('unknown');
      if (this.#now() - lastSeen >= MAX_AGE_MS) return status('stale', false, seen);
      return status(record.ready ? 'online' : 'offline', record.ready, seen);
    } catch {
      // Connection errors can contain credentials. The public status is enough.
      return status('unavailable');
    }
  }

  stop() {
    this.#stopped = true;
    return this.#enqueue(async () => {
      if (!this.#published || !await this.#storage.databaseEnabled()) return false;
      const updated = await this.#storage.updateDocument(this.#key, {}, state => {
        if (state.instanceId !== this.#instanceId) return false;
        state.ready = false;
        state.lastSeen = new Date(this.#now()).toISOString();
        return true;
      });
      return updated?.result === true;
    });
  }

  #enqueue(operation) {
    const task = this.#queue.then(operation);
    this.#queue = task.catch(() => {});
    return task;
  }
}
