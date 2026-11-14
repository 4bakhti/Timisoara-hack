import type { Health, Stats } from "@/lib/contracts";

export type StorageMode = "database" | "memory";

/**
 * Where saved things live: a real database, or the server's memory (lost on restart).
 * Prefers what the answer itself says, then the health report, then the older `db` flag.
 */
export function storageMode(health: Health, stats?: Pick<Stats, "storage"> | null): StorageMode {
  return stats?.storage ?? health.storage ?? (health.db ? "database" : "memory");
}
