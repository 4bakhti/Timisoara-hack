import { Pool } from "pg";
import { Recipe, type EventsRequest, type FeedbackRequest, type Stats } from "@/lib/contracts";
import { firstReadyMs, NO_VOTES } from "./metrics";
import type { Position, Store, VersionStats } from "./types";

/**
 * In libpq, and in the address Tiger Data gives out, sslmode=require means
 * "encrypt, but do not check the certificate". node-postgres 8 checks it fully
 * instead, and Tiger's certificates come from Timescale's own CA
 * (ca.timescale.com), which Node does not know, so every connection failed with
 * SELF_SIGNED_CERT_IN_CHAIN. Ask the driver for the libpq meaning unless the
 * address already decides. sslmode=verify-full still checks the certificate
 * (give it sslrootcert with Timescale's CA).
 */
export function withLibpqSslMode(connectionString: string): string {
  let params: URLSearchParams;
  try {
    params = new URL(connectionString).searchParams;
  } catch {
    return connectionString;
  }
  const mode = params.get("sslmode");
  if ((mode !== "require" && mode !== "prefer") || params.has("uselibpqcompat")) return connectionString;
  // Appended rather than re-serialised, so the rest of the address (and its password) stays byte for byte.
  return `${connectionString}${connectionString.includes("?") ? "&" : "?"}uselibpqcompat=true`;
}

export function createPool(connectionString: string) {
  const pool = new Pool({
    connectionString: withLibpqSslMode(connectionString),
    max: 3,
    connectionTimeoutMillis: 4000,
    statement_timeout: 8000,
  });
  // A network failure on an idle connection must not crash the server or log credentials.
  pool.on("error", () => {});
  return pool;
}

const RECIPE_COLUMNS = `
  id, title, idea, target_pose AS "targetPose", place,
  lat::float8 AS lat, lng::float8 AS lng, status, uses, sample, created_at AS "createdAt"
`;

function recipeFromRow(row: Record<string, unknown>) {
  return Recipe.parse({
    ...Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)),
    createdAt: (row.createdAt as Date).toISOString(),
  });
}

export class PostgresStore implements Store {
  readonly mode = "database" as const;
  private pool?: Pool;

  constructor(private readonly connectionString: string) {}

  // Parse the URL inside the request's error boundary on first use.
  private get db() {
    return this.pool ??= createPool(this.connectionString);
  }

  async close() {
    await this.pool?.end();
  }

  async recordEvents(request: EventsRequest) {
    // The write to both tables is one atomic statement. Only a newly inserted
    // session can supply an ID to the event insert, even under concurrent retries.
    await this.db.query(`
      WITH new_session AS (
        INSERT INTO coach_sessions
          (session_id, app_version, idea_style, mode, outcome, round, first_ready_ms, event_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (session_id) DO NOTHING
        RETURNING session_id
      )
      INSERT INTO coach_events (session_id, t_ms, score, pose, framing, instruction, fps)
      SELECT s.session_id, e.t, e.score, e.pose, e.framing, e.instruction, e.fps
      FROM new_session s
      CROSS JOIN jsonb_to_recordset($9::jsonb) AS e(
        t float8, score float8, pose float8, framing float8, instruction text, fps float8
      )
    `, [request.sessionId, request.appVersion, request.ideaStyle, request.mode,
      request.outcome, request.round, firstReadyMs(request.events), request.events.length,
      JSON.stringify(request.events)]);
  }

  async saveFeedback(request: FeedbackRequest) {
    await this.db.query(`
      INSERT INTO feedback (session_id, app_version, rating, comment, round, before_total, after_total)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (session_id) DO UPDATE SET
        app_version = EXCLUDED.app_version, rating = EXCLUDED.rating, comment = EXCLUDED.comment,
        round = EXCLUDED.round, before_total = EXCLUDED.before_total, after_total = EXCLUDED.after_total,
        updated_at = now()
    `, [request.sessionId, request.appVersion, request.rating, request.comment, request.round,
      request.beforeTotal, request.afterTotal]);
  }

  async stats(round?: string): Promise<Stats> {
    const { rows } = await this.db.query<VersionStats>(`
      WITH sessions AS (
        SELECT app_version, count(*)::float8 AS sessions,
          (count(*) FILTER (WHERE outcome IN ('captured', 'captured-manually')))::float8 AS captured,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY first_ready_ms) / 1000 AS median
        FROM coach_sessions WHERE ($1::text IS NULL OR round = $1) GROUP BY app_version
      ), ratings AS (
        SELECT app_version, count(*)::float8 AS ratings, avg(rating)::float8 AS rating,
          avg(after_total - before_total)::float8 AS gain
        FROM feedback WHERE ($1::text IS NULL OR round = $1) GROUP BY app_version
      )
      SELECT app_version AS "appVersion", coalesce(s.sessions, 0) AS sessions,
        coalesce(s.captured, 0) AS captured, s.median AS "medianSecondsToMatch",
        r.gain AS "avgScoreGain", r.rating AS "avgRating", coalesce(r.ratings, 0) AS ratings
      FROM sessions s FULL JOIN ratings r USING (app_version)
      ORDER BY app_version DESC
    `, [round]);
    return { versions: rows, votes: NO_VOTES, storage: this.mode };
  }

  async insertRecipe(recipe: Recipe) {
    const { rowCount } = await this.db.query(`
      INSERT INTO recipes (id, title, idea, target_pose, place, lat, lng, status, uses, sample, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING
    `, [recipe.id, recipe.title, recipe.idea, recipe.targetPose, recipe.place, recipe.lat,
      recipe.lng, recipe.status, recipe.uses, recipe.sample, recipe.createdAt]);
    return rowCount === 1;
  }

  async listRecipes(near?: Position) {
    const { rows } = await this.db.query(`
      SELECT ${RECIPE_COLUMNS} FROM recipes WHERE status = 'public'
      ORDER BY CASE WHEN $1::float8 IS NOT NULL THEN
        sin(radians(lat::float8)) * sin(radians($1)) +
        cos(radians(lat::float8)) * cos(radians($1)) * cos(radians(lng::float8 - $2::float8))
      END DESC NULLS LAST, created_at DESC, id DESC LIMIT 50
    `, [near?.lat, near?.lng]);
    return rows.map(recipeFromRow);
  }

  async getRecipe(id: string) {
    const { rows } = await this.db.query(`
      SELECT ${RECIPE_COLUMNS} FROM recipes WHERE id = $1 AND status = 'public'
    `, [id]);
    return rows[0] ? recipeFromRow(rows[0]) : null;
  }

  async useRecipe(id: string) {
    const { rowCount } = await this.db.query(
      "UPDATE recipes SET uses = uses + 1 WHERE id = $1 AND status = 'public'", [id],
    );
    return rowCount === 1;
  }

  async hideRecipe(id: string) {
    const { rowCount } = await this.db.query("UPDATE recipes SET status = 'hidden' WHERE id = $1", [id]);
    return rowCount === 1;
  }
}
