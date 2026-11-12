import { it, expect } from "vitest";
import { CustomerRateLimit } from "@/lib/returns/rate-limit";
it("limits a capability and recovers after one minute", () => {
  const limit = new CustomerRateLimit();
  for (let i = 0; i < 60; i++) expect(limit.allow("one", 100000)).toBe(true);
  expect(limit.allow("one", 100000)).toBe(false);
  expect(limit.allow("two", 100000)).toBe(true);
  expect(limit.allow("one", 160001)).toBe(true);
});
it("limits attempts across rotating invalid capabilities", () => {
  const limit = new CustomerRateLimit();
  for (let i = 0; i < 240; i++)
    expect(limit.allow(String(i), 100000)).toBe(true);
  expect(limit.allow("new", 100000)).toBe(false);
});
