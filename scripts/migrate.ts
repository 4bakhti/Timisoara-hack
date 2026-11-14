import { env } from "../src/server/env";
import { migrate } from "../src/server/store/migrations";
import { createPool } from "../src/server/store/postgres";

async function main() {
  const connectionString = env.databaseUrl();
  if (!connectionString) {
    console.error("Set DATABASE_URL before running migrations.");
    process.exitCode = 1;
    return;
  }
  const host = new URL(connectionString).hostname;
  const pool = createPool(connectionString);
  try {
    console.log("Database host: " + host);
    await migrate(pool, (file) => console.log("Applied " + file));
    console.log("Database schema is up to date.");
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error("Migration failed. Check the connection, TLS settings and migration permissions.");
  process.exitCode = 1;
});
