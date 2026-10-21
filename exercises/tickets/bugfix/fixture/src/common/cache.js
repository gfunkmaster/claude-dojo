/** A tiny TTL cache for expensive read endpoints. */
export class TtlCache {
  #entries = new Map();

  constructor(ttlMs, now = () => Date.now()) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  async getOrSet(key, load) {
    const hit = this.#entries.get(key);
    if (hit && hit.expires > this.now()) return hit.value;
    const value = await load();
    this.#entries.set(key, { value, expires: this.now() + this.ttlMs });
    return value;
  }
}
