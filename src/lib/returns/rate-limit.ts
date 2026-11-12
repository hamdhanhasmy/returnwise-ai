import { LoginRateLimit } from "@/lib/auth/rate-limit";
/** Single-instance limit, bounded memory; deploy behind shared ingress limits for multiple instances. */
export class CustomerRateLimit {
  private global = new LoginRateLimit(240);
  private keys = new Map<string, { count: number; until: number }>();
  allow(key: string, now = Date.now()) {
    if (!this.global.allow(now)) return false;
    for (const [k, v] of this.keys) if (v.until <= now) this.keys.delete(k);
    const existing = this.keys.get(key);
    if (existing) return ++existing.count <= 60;
    if (this.keys.size >= 1024) return false;
    this.keys.set(key, { count: 1, until: now + 60000 });
    return true;
  }
}
