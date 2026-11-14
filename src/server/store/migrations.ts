import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

export async function migrate(pool: Pool, report: (filename: string) => void = () => {}) {
  const folder = join(process.cwd(), "db", "migrations");
  const files = (await readdir(folder)).filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file)).sort();
  if (!files.length) throw new Error("No migrations found");
  const db = await pool.connect();
  const applied: string[] = [];
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock($1)", [1945281095]);
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await db.query<{ filename: string }>("SELECT filename FROM schema_migrations");
    const completed = new Set(rows.map(({ filename }) => filename));
    for (const file of files) {
      if (completed.has(file)) continue;
      await db.query(await readFile(join(folder, file), "utf8"));
      await db.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      applied.push(file);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
  applied.forEach(report);
}
