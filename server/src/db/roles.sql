-- Least-privilege database roles for production. Run once as an administrator, after the
-- first migration has created the schema, replacing the passwords.
--
--   pact_owner     owns the schema; used only for migrations (MIGRATION_DATABASE_URL)
--   pact_service   the API and worker at runtime (DATABASE_URL): read/write data, no DDL,
--                  no UPDATE/DELETE on the ledger or audit log, no TRUNCATE
--   pact_app       created by migration 004; person-scoped requests switch into it and
--                  row-level security applies (see 004_rls.sql)
--
-- The runtime grants and service policies are not here: every migration run re-applies
-- them (RUNTIME_GRANTS in migrate.ts), so tables added later are covered too.
--
-- Tested on Postgres 17 (PGlite) by `npm run test:roles`, which runs this file and then the
-- whole API test suite as pact_service. On a managed provider, check that the admin user
-- can create roles and can SET ROLE to pact_owner (Postgres 16+ needs that for the
-- ownership transfer below).

CREATE ROLE pact_owner LOGIN PASSWORD 'change-me-owner';
CREATE ROLE pact_service LOGIN PASSWORD 'change-me-service';

GRANT USAGE, CREATE ON SCHEMA public TO pact_owner;
GRANT USAGE ON SCHEMA public TO pact_service;

-- The runtime role switches into pact_app for person-scoped requests; the owner hands
-- that right on and creates pact_app policies in future migrations.
GRANT pact_app TO pact_service;
GRANT pact_app TO pact_owner WITH ADMIN OPTION;

-- Hand every table, sequence and function to the owner.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO pact_owner', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' AND sequenceowner <> 'pact_owner' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO pact_owner', r.sequencename);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO pact_owner', r.fn);
  END LOOP;
END $$;
