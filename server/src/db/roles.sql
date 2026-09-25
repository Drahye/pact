-- Least-privilege database roles for production. Run once as an administrator, after the
-- first migration, replacing the passwords. Not applied automatically.
--
--   pact_owner     owns the schema; used only for migrations (MIGRATION_DATABASE_URL)
--   pact_service   the API and worker at runtime (DATABASE_URL): read/write data, no DDL,
--                  no UPDATE/DELETE on the ledger or audit log, no TRUNCATE
--   pact_app       created by migration 004; person-scoped requests switch into it and
--                  row-level security applies (see 004_rls.sql)
--
-- Verify on your provider before relying on it: some managed Postgres services restrict
-- role creation or GRANT ... TO a role you don't own.

CREATE ROLE pact_owner LOGIN PASSWORD 'change-me-owner';
CREATE ROLE pact_service LOGIN PASSWORD 'change-me-service';

-- Hand the schema to the owner (run as the role that created the tables).
-- REASSIGN OWNED BY current_user TO pact_owner;

GRANT USAGE ON SCHEMA public TO pact_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pact_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pact_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pact_service;

-- Money and audit records are append-only, even for the runtime role.
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries, ledger_transactions, audit_log FROM pact_service;

-- The runtime role switches into pact_app for person-scoped requests.
GRANT pact_app TO pact_service;

-- pact_service is not the table owner, so RLS applies to it. Give it explicit service
-- policies (the equivalent of a service role) on every table with RLS enabled.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity LOOP
    EXECUTE format('CREATE POLICY service_all ON %I FOR ALL TO pact_service USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Future tables created by migrations get the same grants.
ALTER DEFAULT PRIVILEGES FOR ROLE pact_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pact_service;
ALTER DEFAULT PRIVILEGES FOR ROLE pact_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pact_service;
