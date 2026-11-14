-- Optional: an hourly rollup of live coaching samples, kept up to date by TimescaleDB
-- (a continuous aggregate on the coach_events hypertable). Only when coach_events is a
-- hypertable; otherwise the stats query reads coach_events directly and nothing changes.
DO $migration$
DECLARE extension_schema text;
BEGIN
  SELECT n.nspname INTO extension_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'timescaledb';
  IF extension_schema IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_schema = current_schema() AND hypertable_name = 'coach_events'
  ) THEN
    RETURN;
  END IF;

  -- One row per session and hour. Sums and counts (not averages) so hours, rounds and
  -- versions can be combined exactly at query time.
  -- WITH NO DATA: filling the view cannot happen inside the migration's transaction. The
  -- refresh policy fills it, and real-time aggregation (materialized_only = false) adds
  -- the rows it has not materialised yet, so reads are always current.
  EXECUTE format($sql$
    CREATE MATERIALIZED VIEW coach_activity_hourly
    WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
    SELECT %I.time_bucket(INTERVAL '1 hour', recorded_at) AS bucket,
      session_id,
      count(*) AS samples,
      sum(score) AS score_sum,
      sum(fps) AS fps_sum,
      count(fps) AS fps_samples
    FROM coach_events
    GROUP BY bucket, session_id
    WITH NO DATA
  $sql$, extension_schema);

  EXECUTE format(
    'SELECT %I.add_continuous_aggregate_policy(''coach_activity_hourly'', start_offset => INTERVAL ''3 days'', end_offset => INTERVAL ''1 hour'', schedule_interval => INTERVAL ''15 minutes'')',
    extension_schema
  );
EXCEPTION WHEN OTHERS THEN
  -- PL/pgSQL rolls this block back; the stats query then reads coach_events directly.
  -- Emit only the SQLSTATE; error details could contain private configuration.
  RAISE NOTICE 'Optional TimescaleDB rollup skipped (SQLSTATE %).', SQLSTATE;
END
$migration$;
