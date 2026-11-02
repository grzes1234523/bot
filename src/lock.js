/** Kolejkuje operacje dla jednego użytkownika / podania bez blokowania pozostałych. */
export class KeyedLock {
  #locks = new Map();

  async run(key, operation) {
    const previous = this.#locks.get(key) ?? Promise.resolve();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    this.#locks.set(key, gate);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#locks.get(key) === gate) this.#locks.delete(key);
    }
  }
}
