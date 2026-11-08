import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireSeparateTestDatabase,
  testDatabaseName,
} from "@/lib/validation/env";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  prisma: vi.fn(),
}));
vi.mock("pg", () => ({
  default: {
    Client: class {
      private url: string;
      constructor(options: { connectionString: string }) {
        this.url = options.connectionString;
        mocks.construct(options);
      }
      connect() {
        return mocks.connect();
      }
      query(sql: string) {
        return mocks.query(this.url, sql);
      }
      end() {
        return mocks.end();
      }
    },
  },
}));
vi.mock("../../scripts/database", () => ({ scriptDatabase: mocks.prisma }));
import { testDatabase, verifyTestDatabase } from "../../scripts/test-database";

const valid = {
  DATABASE_URL: "postgresql://user:private@localhost:5432/returnwise_dev",
  TEST_DATABASE_URL: "postgresql://user:private@127.0.0.1:5432/returnwise_test",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue(undefined);
  mocks.end.mockResolvedValue(undefined);
  mocks.query.mockImplementation(async (url: string) => ({
    rows: [{ database: testDatabaseName(url), read_only: "on" }],
  }));
  mocks.prisma.mockReturnValue({ verified: true });
});

describe("test database configuration", () => {
  it.each([
    {},
    { DATABASE_URL: valid.DATABASE_URL },
    { ...valid, TEST_DATABASE_URL: "" },
    { TEST_DATABASE_URL: valid.TEST_DATABASE_URL },
    { ...valid, TEST_DATABASE_URL: "not-a-url-with-private-data" },
    { ...valid, TEST_DATABASE_URL: "https://example.invalid/returnwise_test" },
  ])(
    "rejects missing or malformed configuration before constructing any client: %#",
    async (input) => {
      await expect(testDatabase(input)).rejects.toThrow();
      expect(mocks.construct).not.toHaveBeenCalled();
      expect(mocks.prisma).not.toHaveBeenCalled();
    },
  );

  it.each([
    "postgresql://other@localhost:5432/returnwise_dev",
    "postgresql://other@127.0.0.1:55432/returnwise_dev",
    "postgresql://other@[::1]:5432/returnwise%5fdev",
    "postgresql://user@localhost/postgres",
    "postgresql://user@localhost/template1",
    "postgresql://user@localhost/returnwise_test/",
    "postgresql://user@localhost/returnwise_test%00",
    "postgresql://user@localhost/returnwise_%ZZ_test",
    "postgresql://user@localhost/returnwise_test#fragment",
    "postgresql://user@localhost:0/returnwise_test",
    "postgresql://localhost/returnwise_test",
    "postgresql://user@localhost/",
    `postgresql://user@localhost/${"a".repeat(64)}_test`,
    ...[
      "host=elsewhere",
      "port=5433",
      "database=returnwise_dev",
      "dbname=returnwise_dev",
      "options=-csearch_path=public",
      "schema=public",
      "sslcert=private-file",
      "sslmode=invalid",
      "sslmode=require&sslmode=disable",
    ].map((query) => `postgresql://user@localhost/returnwise_test?${query}`),
  ])("rejects unsafe target %# without database access", async (url) => {
    await expect(
      testDatabase({ ...valid, TEST_DATABASE_URL: url }),
    ).rejects.toThrow();
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.prisma).not.toHaveBeenCalled();
  });

  it("rejects equivalent names across credentials, hosts, ports and percent encoding", () => {
    expect(() =>
      requireSeparateTestDatabase({
        DATABASE_URL: "postgres://first@localhost/shared_test",
        TEST_DATABASE_URL: "postgresql://second@[::1]:55432/shared%5ftest",
      }),
    ).toThrow("separate database");
  });

  it("rejects a test target matching the migration-owner database", () => {
    expect(() =>
      requireSeparateTestDatabase({
        ...valid,
        DATABASE_MIGRATION_URL: valid.TEST_DATABASE_URL,
      }),
    ).toThrow("separate database");
  });

  it("accepts explicit isolated names and supported TLS settings without changing runtime env", () => {
    const input = {
      ...valid,
      TEST_DATABASE_URL: valid.TEST_DATABASE_URL + "?sslmode=verify-full",
    };
    expect(requireSeparateTestDatabase(input)).toBe(input.TEST_DATABASE_URL);
    expect(input.DATABASE_URL).toBe(valid.DATABASE_URL);
  });
});

describe("live identity gate before Prisma or migrations", () => {
  it("uses read-only probes for both databases and passes only the verified test URL to Prisma", async () => {
    expect(await testDatabase(valid)).toEqual({ verified: true });
    expect(mocks.construct).toHaveBeenCalledTimes(2);
    expect(mocks.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: valid.TEST_DATABASE_URL,
        options: "-c default_transaction_read_only=on",
      }),
    );
    expect(mocks.query).toHaveBeenCalledWith(
      valid.TEST_DATABASE_URL,
      expect.stringContaining("current_database()"),
    );
    expect(mocks.prisma).toHaveBeenCalledExactlyOnceWith(
      valid.TEST_DATABASE_URL,
    );
    expect(mocks.end).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.end.mock.invocationCallOrder[1]!,
    );
  });

  it.each(["DATABASE_URL", "TEST_DATABASE_URL"] as const)(
    "rejects a pooler/backend name mismatch in %s",
    async (key) => {
      mocks.query.mockImplementation(async (url: string) => ({
        rows: [
          {
            database:
              url === valid[key]
                ? "unexpected_database"
                : testDatabaseName(url),
            read_only: "on",
          },
        ],
      }));
      await expect(testDatabase(valid)).rejects.toThrow(
        `verification failed for ${key}`,
      );
      expect(mocks.prisma).not.toHaveBeenCalled();
      expect(mocks.end).toHaveBeenCalled();
    },
  );

  it("rejects a probe without read-only protection", async () => {
    mocks.query.mockResolvedValue({
      rows: [{ database: "returnwise_dev", read_only: "off" }],
    });
    await expect(testDatabase(valid)).rejects.toThrow("verification failed");
    expect(mocks.prisma).not.toHaveBeenCalled();
  });

  it("fails closed and redacts connection errors", async () => {
    mocks.connect.mockRejectedValue(new Error(valid.TEST_DATABASE_URL));
    await expect(verifyTestDatabase(valid)).rejects.toThrow(
      /^Database isolation verification failed for DATABASE_URL; no test writes or migrations were started$/,
    );
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.prisma).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});
