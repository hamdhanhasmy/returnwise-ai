import { afterEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ $queryRaw: query }) }));
import { GET } from "@/app/api/health/route";
afterEach(() => {
  vi.unstubAllEnvs();
  query.mockReset();
});
describe("readiness endpoint", () => {
  it("returns 503 when database configuration is absent", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).database).toBe("unconfigured");
    expect(query).not.toHaveBeenCalled();
  });
  it("returns 503 without disclosing database errors", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@localhost/dev");
    query.mockRejectedValue(new Error("private password: secret"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
});
