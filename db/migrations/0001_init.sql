CREATE TABLE coach_sessions (
  session_id text PRIMARY KEY,
  app_version text NOT NULL,
  idea_style text,
  mode text,
  outcome text,
  round text,
  first_ready_ms double precision,
  event_count integer NOT NULL CHECK (event_count BETWEEN 0 AND 600),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coach_events (
  session_id text NOT NULL REFERENCES coach_sessions(session_id),
  t_ms double precision NOT NULL,
  score double precision NOT NULL,
  pose double precision,
  framing double precision,
  instruction text,
  fps double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_events_session_idx ON coach_events (session_id, t_ms);
CREATE INDEX coach_sessions_round_idx ON coach_sessions (round, app_version);

CREATE TABLE feedback (
  session_id text PRIMARY KEY,
  app_version text NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment varchar(500),
  round text,
  before_total smallint CHECK (before_total BETWEEN 0 AND 100),
  after_total smallint CHECK (after_total BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_round_idx ON feedback (round, app_version);

CREATE TABLE recipes (
  id text PRIMARY KEY,
  title varchar(80) NOT NULL,
  idea jsonb NOT NULL,
  target_pose jsonb,
  place varchar(80),
  lat numeric(7,4) CHECK (lat BETWEEN -90 AND 90),
  lng numeric(7,4) CHECK (lng BETWEEN -180 AND 180),
  status text NOT NULL CHECK (status IN ('draft', 'public', 'hidden')),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  sample boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recipes_public_recent_idx ON recipes (created_at DESC, id DESC) WHERE status = 'public';
