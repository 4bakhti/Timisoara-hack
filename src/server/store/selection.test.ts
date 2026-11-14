import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  delete (globalThis as typeof globalThis & { framewiseStore?: unknown }).framewiseStore;
  vi.unstubAllEnvs(); vi.resetModules();
});
it("selects once, using bounded memory only when no database is configured", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const { getStore } = await import("./index");
  const first = getStore();
  expect(first.mode).toBe("memory");
  vi.stubEnv("DATABASE_URL", "not-a-real-connection");
  expect(getStore()).toBe(first);
});
it("does not replace a configured but broken database with demo memory", async () => {
  vi.stubEnv("DATABASE_URL", "invalid://test-only");
  const { getStore } = await import("./index");
  const first = getStore();
  expect(first.mode).toBe("database");
  // Fail at the store boundary without a real connection attempt.
  vi.spyOn(first, "stats").mockRejectedValue(new Error("unavailable"));
  await expect(first.stats()).rejects.toThrow("unavailable");
  expect(getStore()).toBe(first);
});
it("reports configured storage separately from successful connectivity", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const { GET } = await import("@/app/api/health/route");
  expect(await GET().json()).toMatchObject({ db: false, storage: "memory" });
  vi.stubEnv("DATABASE_URL", "invalid://test-only");
  expect(await GET().json()).toMatchObject({ db: true, storage: "database" });
});
