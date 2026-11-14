import { describe, expect, it } from "vitest";
import { HEALTH_NO_DB, HEALTH_WITH_DB } from "@/components/test-fixtures";
import { storageMode } from "./storage";

describe("storageMode", () => {
  it("prefers the answer's own report, then health.storage, then the db flag", () => {
    expect(storageMode({ ...HEALTH_WITH_DB, storage: "database" }, { storage: "memory" })).toBe("memory");
    expect(storageMode({ ...HEALTH_NO_DB, storage: "database" })).toBe("database");
    expect(storageMode({ ...HEALTH_WITH_DB, storage: "memory" }, null)).toBe("memory");
    expect(storageMode(HEALTH_WITH_DB)).toBe("database");
    expect(storageMode(HEALTH_NO_DB, {})).toBe("memory");
  });
});
