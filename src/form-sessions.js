import crypto from 'node:crypto';

// Przechowywanie odpowiedzi pomiędzy modalami w RAM; nie zapisujemy nieukończonych podań do bazy.
export class FormSessions {
  #sessions = new Map();
  constructor(ttlMs = 30 * 60 * 1000, now = () => Date.now()) {
    this.ttlMs = ttlMs;
    this.now = now;
  }
  start(userId) {
    // Sprzątamy wygasłe formularze przy kolejnych otwarciach (bez dodatkowego timera).
    for (const [id, session] of this.#sessions) {
      if (session.expiresAt <= this.now()) this.#sessions.delete(id);
    }
    const token = crypto.randomBytes(9).toString('hex');
    const session = { userId, token, stage: 1, answers: {}, expiresAt: this.now() + this.ttlMs };
    this.#sessions.set(userId, session);
    return { ...session, answers: {} };
  }
  get(userId, token, stage) {
    const session = this.#sessions.get(userId);
    if (!session || session.token !== token || session.expiresAt <= this.now() || session.stage !== stage) {
      if (session?.expiresAt <= this.now()) this.#sessions.delete(userId);
      return null;
    }
    return { ...session, answers: { ...session.answers } };
  }
  advance(userId, token, step, values) {
    const current = this.get(userId, token, step);
    if (!current) return null;
    const updated = { ...current, stage: step + 1, answers: { ...current.answers, ...values }, expiresAt: this.now() + this.ttlMs };
    this.#sessions.set(userId, updated);
    return { ...updated, answers: { ...updated.answers } };
  }
  clear(userId, token) {
    if (this.#sessions.get(userId)?.token === token) this.#sessions.delete(userId);
  }
}
