import { env } from "@/server/env";
import { MemoryStore } from "./memory";
import { PostgresStore } from "./postgres";
import type { Store } from "./types";

// Next route bundles can load this module separately. Share a single store per
// Node process, including one connection pool when Postgres is configured.
const runtime = globalThis as typeof globalThis & { framewiseStore?: Store };

export function getStore(): Store {
  const connectionString = env.databaseUrl();
  return runtime.framewiseStore ??= connectionString ? new PostgresStore(connectionString) : new MemoryStore();
}
