import { expect, it } from "vitest";
import { LoginRateLimit } from "@/lib/auth/rate-limit";
it("bounds sign-in work and resets the fixed-size window", () => {
  const limiter = new LoginRateLimit(2, 1000);
  expect(limiter.allow(1000)).toBe(true);
  expect(limiter.allow(1001)).toBe(true);
  expect(limiter.allow(1002)).toBe(false);
  expect(limiter.allow(2000)).toBe(true);
});
