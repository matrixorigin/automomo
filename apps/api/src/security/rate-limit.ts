export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly options: RateLimitOptions = { limit: 60, windowMs: 60_000 }) {}

  check(key: string, now = Date.now()) {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.options.windowMs });
      return { ok: true, remaining: this.options.limit - 1, resetAt: now + this.options.windowMs };
    }
    if (current.count >= this.options.limit) {
      return { ok: false, remaining: 0, resetAt: current.resetAt };
    }
    current.count += 1;
    return { ok: true, remaining: this.options.limit - current.count, resetAt: current.resetAt };
  }
}
