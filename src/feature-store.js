import fs from 'node:fs/promises';
import path from 'node:path';
import { databaseEnabled, loadDocument, refreshDocument, updateDocument } from './database.js';

const initialState = () => ({
  economy: {},
  economyConfig: { currencySymbol: 'StrefaCoins', initialBank: 100, initialWallet: 100, dailyReward: 100, workMin: 15, workMax: 60, thousandsSeparator: 'space', currencyPosition: 'right' },
  warnings: {},
  moderation: { permissions: {}, protectedRoleIds: [], hierarchyEnabled: false },
  autoChannels: { joinChannelId: null, categoryId: null, template: 'Kanał {name}', createdIds: [] },
  voiceSupport: { channelId: null, supportRoleId: null },
  statisticsChannels: { categoryId: null, onlineChannelId: null, membersChannelId: null, botsChannelId: null, panelChannelId: null, panelMessageId: null },
  tickets: { categoryId: null, supportRoleId: null, panels: [], items: [], nextId: 1, blacklist: [], logChannelId: null, maxOpenPerUser: 1, guildSettings: {}, auditLogs: [] },
  embeds: { messages: [], templates: [], scheduled: [], drafts: [] },
  verification: { roleId: null, channelId: null, messageId: null, title: '✅ Weryfikacja', description: 'Kliknij przycisk, aby otrzymać rolę po weryfikacji.', buttonLabel: 'Zweryfikuj się' },
  automod: { keywords: [], ruleId: null, enabled: true },
  logChannelId: null,
});

export class FeatureStore {
  #file;
  #state = initialState();
  #queue = Promise.resolve();
  #database = false;

  constructor(filename) { this.#file = filename; }

  async init() {
    await fs.mkdir(path.dirname(this.#file), { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.#file, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Nieprawidłowy plik modułów.');
      this.#state = this.#normalize(parsed);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.#write(this.#state);
    }
    this.#database = await databaseEnabled();
    if (this.#database) {
      this.#state = this.#normalize(await loadDocument('features', this.#state));
      // Project an existing JSON document into the normalized tables on first boot
      // too; migrations may have run before this document was seeded.
      await updateDocument('features', this.#state, () => undefined);
    }
  }

  #normalize(parsed) {
    const initial = initialState();
    const state = { ...initial, ...parsed };
    state.economy ??= {};
    state.economyConfig = { ...initial.economyConfig, ...(state.economyConfig ?? {}) };
    state.warnings ??= {};
    state.moderation = { ...initial.moderation, ...(state.moderation ?? {}) };
    state.moderation.permissions ??= {};
    state.moderation.protectedRoleIds ??= [];
    state.autoChannels = { ...initial.autoChannels, ...(state.autoChannels ?? {}) };
    state.voiceSupport = { ...initial.voiceSupport, ...(state.voiceSupport ?? {}) };
    state.statisticsChannels = { ...initial.statisticsChannels, ...(state.statisticsChannels ?? {}) };
    state.tickets = { ...initial.tickets, ...(state.tickets ?? {}) };
    state.tickets.panels ??= [];
    state.tickets.items ??= [];
    state.tickets.blacklist ??= [];
    state.tickets.guildSettings ??= {};
    state.tickets.auditLogs ??= [];
    state.embeds = { ...initial.embeds, ...(state.embeds ?? {}) };
    state.embeds.messages ??= [];
    state.embeds.templates ??= [];
    state.embeds.scheduled ??= [];
    state.embeds.drafts ??= [];
    state.verification = { ...initial.verification, ...(state.verification ?? {}) };
    state.automod = { ...initial.automod, ...(state.automod ?? {}) };
    return state;
  }

  snapshot() { return structuredClone(this.#state); }

  async refresh() {
    if (!this.#database) return this.snapshot();
    const fresh = await refreshDocument('features');
    if (fresh) this.#state = this.#normalize(fresh);
    return this.snapshot();
  }

  async update(change) {
    const task = this.#queue.then(async () => {
      if (this.#database) {
        const updated = await updateDocument('features', this.#state, change);
        this.#state = this.#normalize(updated.state);
        return updated.result;
      }
      const draft = structuredClone(this.#state);
      const result = await change(draft);
      await this.#write(draft);
      this.#state = draft;
      return result;
    });
    this.#queue = task.then(() => {}, () => {});
    return task;
  }

  async #write(state) {
    const temporary = `${this.#file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporary, this.#file);
    } catch (error) {
      await fs.unlink(temporary).catch(() => {});
      throw error;
    }
  }
}
