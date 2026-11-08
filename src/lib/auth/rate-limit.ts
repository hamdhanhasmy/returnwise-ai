// Bounded process-local protection for the single-instance foundation.
// Multi-instance hosting requires a shared limiter or ingress protection.
export class LoginRateLimit {
  private windowStart = 0;
  private attempts = 0;
  constructor(
    private readonly maximum = 60,
    private readonly windowMs = 60_000,
  ) {}
  allow(now = Date.now()) {
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.attempts = 0;
    }
    this.attempts += 1;
    return this.attempts <= this.maximum;
  }
}
export const loginRateLimit = new LoginRateLimit();
