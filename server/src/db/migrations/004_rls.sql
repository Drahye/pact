-- Row-level security: a second, independent layer under the API's own checks.
--
-- Requests on behalf of a person run as the restricted role `pact_app`, with the
-- person's id in the transaction-local setting `pact.user_id` (see db.asUser).
-- `pact_app` can only see rows those policies allow and has no access at all to
-- money tables, credentials, sessions or the audit log.
--
-- Operations that must touch system accounts (the ledger, payouts, webhooks, jobs)
-- run in the service context with explicit authorization in code, the same pattern
-- as a "service role". Those paths are covered by the integration tests.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pact_app') THEN
    CREATE ROLE pact_app NOLOGIN;
  END IF;
END $$;
-- The connecting role must be able to switch into pact_app.
DO $$ BEGIN
  EXECUTE format('GRANT pact_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN NULL; -- superusers can already SET ROLE
END $$;

CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('pact.user_id', true), '')::uuid
$$;

-- Membership helpers run with the owner's rights so policies on pact_members don't recurse.
CREATE FUNCTION pact_role(p uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN m.role = 'organizer' AND m.status = 'joined' THEN 'organizer' ELSE m.status END
    FROM pact_members m WHERE m.pact_id = p AND m.user_id = app_user_id()
$$;
CREATE FUNCTION can_see_pact(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(pact_role(p) IN ('organizer', 'joined', 'invited'), false)
$$;
CREATE FUNCTION is_in_pact(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(pact_role(p) IN ('organizer', 'joined'), false)
$$;
CREATE FUNCTION is_organizer(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(pact_role(p) = 'organizer', false)
$$;
CREATE FUNCTION pact_is_open(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM pacts WHERE id = p AND status IN ('open', 'funded'))
$$;
CREATE FUNCTION shares_pact_with(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pact_members a JOIN pact_members b ON b.pact_id = a.pact_id
     WHERE a.user_id = app_user_id() AND a.status IN ('joined', 'invited')
       AND b.user_id = u AND b.status <> 'left')
$$;
GRANT EXECUTE ON FUNCTION app_user_id(), pact_role(uuid), can_see_pact(uuid), is_in_pact(uuid), is_organizer(uuid), pact_is_open(uuid), shares_pact_with(uuid) TO pact_app;

-- Every user-data table gets RLS, including the ones pact_app is never granted.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pact_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pact_phone_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pact_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
-- No grants and no policies on the money, credential and platform tables above:
-- pact_app is denied outright. Only the service context reaches them.

-- users: only public profile columns, only for yourself and people you share a Pact with.
GRANT SELECT (id, first_name, last_name, color, tint, photo_url, status) ON users TO pact_app;
CREATE POLICY users_visible ON users FOR SELECT TO pact_app
  USING (id = app_user_id() OR shares_pact_with(id));

-- pacts: visible to members and invitees. Changes go through the service (they move money).
GRANT SELECT ON pacts TO pact_app;
CREATE POLICY pacts_visible ON pacts FOR SELECT TO pact_app USING (can_see_pact(id));

-- members: visible within the Pact; you may update only how you're taking part.
GRANT SELECT ON pact_members TO pact_app;
GRANT UPDATE (participation) ON pact_members TO pact_app;
CREATE POLICY members_visible ON pact_members FOR SELECT TO pact_app USING (can_see_pact(pact_id));
CREATE POLICY members_update_self ON pact_members FOR UPDATE TO pact_app
  USING (user_id = app_user_id() AND status = 'joined') WITH CHECK (user_id = app_user_id() AND status = 'joined');

-- invites by phone: organisers see the count through the service only.
-- activity: joined members only; writes by the service.
GRANT SELECT ON activities TO pact_app;
CREATE POLICY activities_visible ON activities FOR SELECT TO pact_app USING (is_in_pact(pact_id));
GRANT INSERT ON activities TO pact_app;
CREATE POLICY activities_insert ON activities FOR INSERT TO pact_app
  WITH CHECK (is_in_pact(pact_id) AND actor_id = app_user_id()
    AND type IN ('committed', 'task_added', 'task_claimed', 'task_done', 'memory_added'));

-- budget: members read; only the organiser edits, while the Pact is open.
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_items TO pact_app;
CREATE POLICY budget_visible ON budget_items FOR SELECT TO pact_app USING (can_see_pact(pact_id));
CREATE POLICY budget_insert ON budget_items FOR INSERT TO pact_app
  WITH CHECK (is_organizer(pact_id) AND pact_is_open(pact_id) AND created_by = app_user_id());
CREATE POLICY budget_update ON budget_items FOR UPDATE TO pact_app
  USING (is_organizer(pact_id) AND pact_is_open(pact_id)) WITH CHECK (is_organizer(pact_id));
CREATE POLICY budget_delete ON budget_items FOR DELETE TO pact_app
  USING (is_organizer(pact_id) AND pact_is_open(pact_id));

-- tasks: members read and add; the assignee or organiser updates; creator or organiser deletes.
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO pact_app;
CREATE POLICY tasks_visible ON tasks FOR SELECT TO pact_app USING (can_see_pact(pact_id));
CREATE POLICY tasks_insert ON tasks FOR INSERT TO pact_app
  WITH CHECK (is_in_pact(pact_id) AND pact_is_open(pact_id) AND created_by = app_user_id());
CREATE POLICY tasks_update ON tasks FOR UPDATE TO pact_app
  USING (is_in_pact(pact_id) AND (is_organizer(pact_id) OR assignee_id = app_user_id() OR assignee_id IS NULL))
  WITH CHECK (is_in_pact(pact_id) AND (is_organizer(pact_id) OR assignee_id = app_user_id() OR assignee_id IS NULL));
CREATE POLICY tasks_delete ON tasks FOR DELETE TO pact_app
  USING (is_organizer(pact_id) OR (created_by = app_user_id() AND status = 'open'));

-- memories: joined members read; the organiser writes.
GRANT SELECT, INSERT, UPDATE ON pact_memories TO pact_app;
CREATE POLICY memory_visible ON pact_memories FOR SELECT TO pact_app USING (is_in_pact(pact_id));
CREATE POLICY memory_insert ON pact_memories FOR INSERT TO pact_app WITH CHECK (is_organizer(pact_id) AND updated_by = app_user_id());
CREATE POLICY memory_update ON pact_memories FOR UPDATE TO pact_app USING (is_organizer(pact_id)) WITH CHECK (is_organizer(pact_id));

GRANT SELECT, INSERT, DELETE ON memory_photos TO pact_app;
CREATE POLICY photos_visible ON memory_photos FOR SELECT TO pact_app USING (is_in_pact(pact_id));
CREATE POLICY photos_insert ON memory_photos FOR INSERT TO pact_app WITH CHECK (is_organizer(pact_id) AND uploaded_by = app_user_id());
CREATE POLICY photos_delete ON memory_photos FOR DELETE TO pact_app USING (is_organizer(pact_id));

-- notifications: your own only.
GRANT SELECT ON notifications TO pact_app;
GRANT UPDATE (read_at) ON notifications TO pact_app;
CREATE POLICY notifications_own ON notifications FOR SELECT TO pact_app USING (user_id = app_user_id());
CREATE POLICY notifications_mark_read ON notifications FOR UPDATE TO pact_app
  USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- Pending phone invites: a count for people in the Pact, never the numbers themselves.
CREATE FUNCTION pact_pending_invites(p uuid) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN can_see_pact(p)
    THEN (SELECT count(*)::int FROM pact_phone_invites WHERE pact_id = p AND claimed_at IS NULL) ELSE 0 END
$$;
GRANT EXECUTE ON FUNCTION pact_pending_invites(uuid) TO pact_app;

-- When a Pact has a budget, its target is the budget total. Organiser only, never below
-- what has already been raised. Returns the Pact's status afterwards.
CREATE FUNCTION sync_target_to_budget(p uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total BIGINT; pr pacts%ROWTYPE;
BEGIN
  IF NOT is_organizer(p) THEN RAISE EXCEPTION 'not_organizer' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO pr FROM pacts WHERE id = p FOR UPDATE;
  IF pr.status <> 'open' THEN RAISE EXCEPTION 'pact_closed' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO total FROM budget_items WHERE pact_id = p;
  IF total = 0 THEN RETURN pr.status; END IF;
  IF total < 100000 THEN RAISE EXCEPTION 'budget_too_small' USING ERRCODE = 'P0001'; END IF;
  IF total < pr.raised_amount THEN RAISE EXCEPTION 'budget_below_raised' USING ERRCODE = 'P0001'; END IF;
  UPDATE pacts SET target_amount = total WHERE id = p;
  IF pr.raised_amount >= total THEN
    UPDATE pacts SET status = 'funded', funded_at = now() WHERE id = p;
    INSERT INTO activities (pact_id, actor_id, type) VALUES (p, app_user_id(), 'completed');
    RETURN 'funded';
  END IF;
  RETURN 'open';
END $$;
GRANT EXECUTE ON FUNCTION sync_target_to_budget(uuid) TO pact_app;
