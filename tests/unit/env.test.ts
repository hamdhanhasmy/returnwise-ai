import { describe, expect, it } from "vitest";
import {
  parseEnvironment,
  requireDatabaseUrl,
  requireSeparateTestDatabase,
} from "@/lib/validation/env";
describe("server environment", () => {
  it("builds without integration credentials", () => {
    expect(parseEnvironment({})).toMatchObject({ PAYPAL_ENV: "sandbox" });
  });
  it("rejects live mode and invalid origins", () => {
    expect(() => parseEnvironment({ PAYPAL_ENV: "live" })).toThrow(
      "PAYPAL_ENV",
    );
    expect(() =>
      parseEnvironment({ APP_BASE_URL: "https://app.example/path" }),
    ).toThrow("APP_BASE_URL");
    expect(() =>
      parseEnvironment({ APP_BASE_URL: "private-invalid-origin" }),
    ).toThrow(/^Invalid environment configuration: APP_BASE_URL$/);
    expect(() =>
      parseEnvironment({ APP_BASE_URL: "http://remote.example" }),
    ).toThrow("APP_BASE_URL");
  });
  it("does not reveal a credential in validation errors", () => {
    expect(() =>
      parseEnvironment({ DATABASE_URL: "secret-do-not-echo" }),
    ).toThrow(/^Invalid environment configuration: DATABASE_URL$/);
  });
  it("requires a database for database work", () => {
    expect(() => requireDatabaseUrl({})).toThrow("DATABASE_URL is required");
  });
  it("rejects test aliases of the runtime database and requires test naming", () => {
    expect(() =>
      requireSeparateTestDatabase({
        DATABASE_URL: "postgresql://user@localhost/live",
        TEST_DATABASE_URL: "postgresql://user@127.0.0.1/live?schema=test",
      }),
    ).toThrow("separate database");
    expect(() =>
      requireSeparateTestDatabase({
        DATABASE_URL: "postgresql://user@localhost/live",
        TEST_DATABASE_URL: "postgresql://user@localhost/another",
      }),
    ).toThrow();
    expect(
      requireSeparateTestDatabase({
        DATABASE_URL: "postgresql://user@localhost/dev",
        TEST_DATABASE_URL: "postgresql://user@localhost/dev_test",
      }),
    ).toContain("dev_test");
  });
});
