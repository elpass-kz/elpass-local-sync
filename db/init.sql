-- ===========================================
-- elpass-syncer-local: Database initialization
-- ===========================================

-- Roles for PostgREST
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'authenticator_pass';
  END IF;
END
$$;

GRANT web_anon TO authenticator;
GRANT service_role TO authenticator;

-- ===========================================
-- Tables
-- ===========================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS el_tcards (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  photo TEXT,
  "isBlocked" BOOLEAN DEFAULT false,
  "isDisabled" BOOLEAN DEFAULT false,
  begin_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  meta_ JSONB DEFAULT '{}'::jsonb,
  status JSONB DEFAULT '{}'::jsonb,
  "group" TEXT,
  groups JSONB DEFAULT '[]'::jsonb,
  host TEXT,
  s_user TEXT,
  "isOK" BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS el_tdir_terminals (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  name TEXT,
  type TEXT NOT NULL CHECK (type IN ('H', 'hik', 'D', 'dah')),
  online BOOLEAN DEFAULT false,
  disabled BOOLEAN DEFAULT false,
  host TEXT,
  meta_ JSONB DEFAULT '{}'::jsonb
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_el_tcards_uuid ON el_tcards(uuid);
CREATE INDEX IF NOT EXISTS idx_el_tcards_no ON el_tcards(no);
CREATE INDEX IF NOT EXISTS idx_el_tcards_groups ON el_tcards USING GIN (groups);
CREATE INDEX IF NOT EXISTS idx_el_tcards_meta ON el_tcards USING GIN (meta_);
CREATE INDEX IF NOT EXISTS idx_el_tcards_deleted_at ON el_tcards(deleted_at);
CREATE INDEX IF NOT EXISTS idx_el_tcards_created_at ON el_tcards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_el_tdir_terminals_host ON el_tdir_terminals(host);
CREATE INDEX IF NOT EXISTS idx_el_tdir_terminals_meta ON el_tdir_terminals USING GIN (meta_);

-- ===========================================
-- RPC function: el_terminals_count
-- Returns card numbers that should be on a terminal
-- ===========================================

CREATE OR REPLACE FUNCTION el_terminals_count(
  object_guid TEXT,
  entrance_number TEXT
)
RETURNS JSON AS $$
DECLARE
  result TEXT[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT c.no)
  INTO result
  FROM el_tcards c
  WHERE c.deleted_at IS NULL
    AND c.meta_ @> jsonb_build_object('objectGuid', object_guid)
    AND (
      c.meta_->'zones' @> to_jsonb(entrance_number)
      OR c.meta_->>'zone' = entrance_number
      OR c.meta_->>'zone' = 'all'
    );

  RETURN json_build_object('data', COALESCE(result, ARRAY[]::TEXT[]));
END;
$$ LANGUAGE plpgsql STABLE;

-- ===========================================
-- Auto-update updated_at trigger
-- ===========================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS el_tcards_updated_at ON el_tcards;
CREATE TRIGGER el_tcards_updated_at
  BEFORE UPDATE ON el_tcards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- Permissions
-- ===========================================

-- service_role: full access
GRANT ALL ON el_tcards TO service_role;
GRANT ALL ON el_tdir_terminals TO service_role;
GRANT USAGE, SELECT ON SEQUENCE el_tcards_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION el_terminals_count(TEXT, TEXT) TO service_role;

-- web_anon: read-only
GRANT SELECT ON el_tcards TO web_anon;
GRANT SELECT ON el_tdir_terminals TO web_anon;
GRANT EXECUTE ON FUNCTION el_terminals_count(TEXT, TEXT) TO web_anon;
