-- Optional acceleration only. Never install extensions or require TimescaleDB.
-- Missing extension, permissions or unsupported conversion leave the plain table intact.
DO $migration$
DECLARE extension_schema text;
BEGIN
  SELECT n.nspname INTO extension_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'timescaledb';
  IF extension_schema IS NULL THEN
    RETURN;
  END IF;

  -- Avoid conversion lock-order deadlocks with the referenced session table.
  LOCK TABLE coach_sessions IN SHARE ROW EXCLUSIVE MODE;
  EXECUTE format(
    'SELECT %I.create_hypertable(''coach_events''::regclass, ''recorded_at''::name, if_not_exists => true, migrate_data => true)',
    extension_schema
  );
EXCEPTION WHEN OTHERS THEN
  -- PL/pgSQL rolls this block back, preserving the normal PostgreSQL path.
  -- Emit only the SQLSTATE; error details could contain private configuration.
  RAISE NOTICE 'Optional TimescaleDB conversion skipped (SQLSTATE %).', SQLSTATE;
END
$migration$;
