import { describe, expect, it } from "vitest";
import { isTrustedOrigin, readSmallForm } from "@/lib/validation/http";
describe("mutation request boundary", () => {
  it("requires exact origin including port", () => {
    expect(
      isTrustedOrigin(
        new Request("http://localhost/", {
          headers: { origin: "https://evil.example" },
        }),
        "http://localhost:3000",
      ),
    ).toBe(false);
    expect(
      isTrustedOrigin(
        new Request("http://localhost/"),
        "http://localhost:3000",
      ),
    ).toBe(false);
    expect(
      isTrustedOrigin(
        new Request("http://localhost/", {
          headers: { origin: "http://localhost:3000" },
        }),
        "http://localhost:3000",
      ),
    ).toBe(true);
  });
  it("bounds form bodies and content types", async () => {
    const form = await readSmallForm(
      new Request("http://localhost", {
        method: "POST",
        body: new URLSearchParams({ token: "test" }),
      }),
    );
    expect(form.get("token")).toBe("test");
    await expect(
      readSmallForm(
        new Request("http://localhost", {
          method: "POST",
          body: new URLSearchParams({ token: "x".repeat(5000) }),
        }),
      ),
    ).rejects.toThrow("Body too large");
    await expect(
      readSmallForm(
        new Request("http://localhost", {
          method: "POST",
          body: "{}",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toThrow();
  });
});
