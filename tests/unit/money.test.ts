import { describe, expect, it } from "vitest";
import { formatUsd, parseUsd } from "@/lib/money";
describe("integer USD boundary", () => {
  it("keeps cents exact", () => {
    expect(parseUsd("0.10") + parseUsd("0.20")).toBe(30n);
    expect(parseUsd("1000.00")).toBe(100000n);
  });
  it.each(["-1.00", "1.001", "1e2", "NaN", "1", "01.00", "+1.00", "1000.01"])(
    "rejects invalid or oversized input %s",
    (value) => {
      expect(() => parseUsd(value)).toThrow();
    },
  );
  it("formats without conversion to floating point", () => {
    expect(formatUsd(8000n)).toBe("$80.00");
    expect(formatUsd(-1300n)).toBe("−$13.00");
    expect(formatUsd(900719925474099301n)).toBe("$9,007,199,254,740,993.01");
  });
});
