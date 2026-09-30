-- Order Pacts (aso-ebi, souvenirs, tickets): the organiser lists items at fixed prices,
-- people order an item, a size or colour and a quantity, and pay by the Pact's date.
-- The Pact's target is the sum of the orders; a person's payments cover their orders
-- oldest first, however they paid.

ALTER TABLE pacts ADD COLUMN mode TEXT NOT NULL DEFAULT 'goal' CHECK (mode IN ('goal', 'orders'));
-- An order Pact starts at zero and grows with its orders.
ALTER TABLE pacts DROP CONSTRAINT pacts_target_amount_check;
ALTER TABLE pacts ADD CONSTRAINT pacts_target_amount_check CHECK (target_amount >= 100000 OR (mode = 'orders' AND target_amount >= 0));

CREATE TABLE pact_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id     UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  price       BIGINT NOT NULL CHECK (price >= 10000),              -- at least ₦100
  options     TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(options) <= 12),
  stock       INT CHECK (stock IS NULL OR stock > 0),
  position    INT NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pact_items_pact_idx ON pact_items (pact_id, position);

CREATE TABLE pact_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id       UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES pact_items(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  option        TEXT CHECK (option IS NULL OR char_length(option) <= 30),
  quantity      INT NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  unit_price    BIGINT NOT NULL CHECK (unit_price > 0),
  amount        BIGINT NOT NULL CHECK (amount > 0),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'lapsed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ
);
CREATE INDEX pact_orders_pact_idx ON pact_orders (pact_id, created_at);
CREATE INDEX pact_orders_user_idx ON pact_orders (pact_id, user_id) WHERE status = 'active';

-- Organiser or co-organiser (the people who run the order sheet).
CREATE FUNCTION is_pact_admin(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM pact_members WHERE pact_id = p AND user_id = app_user_id() AND status = 'joined' AND role IN ('organizer', 'co_organizer'))
$$;
-- How many of each item are taken, for anyone who can see the Pact (not who took them).
CREATE FUNCTION pact_item_counts(p uuid) RETURNS TABLE (item_id uuid, ordered bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.item_id, SUM(o.quantity)::bigint FROM pact_orders o
   WHERE o.pact_id = p AND o.status = 'active' AND can_see_pact(p)
   GROUP BY o.item_id
$$;
GRANT EXECUTE ON FUNCTION is_pact_admin(uuid), pact_item_counts(uuid) TO pact_app;

ALTER TABLE pact_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pact_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON pact_items TO pact_app;
CREATE POLICY pact_items_visible ON pact_items FOR SELECT TO pact_app USING (can_see_pact(pact_id));
-- Sizes are personal: you see your own orders; organisers see the whole sheet.
GRANT SELECT ON pact_orders TO pact_app;
CREATE POLICY pact_orders_visible ON pact_orders FOR SELECT TO pact_app USING (user_id = app_user_id() OR is_pact_admin(pact_id));

ALTER TABLE activities DROP CONSTRAINT activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK (type IN (
  'created', 'join', 'contribution', 'completed', 'released', 'refunded', 'cancelled', 'nudge', 'left',
  'committed', 'task_added', 'task_claimed', 'task_done', 'milestone', 'split_requested', 'memory_added',
  'guest_contribution', 'vendor_paid', 'co_organizer', 'release_requested', 'pledged', 'pledge_kept',
  'ordered', 'orders_closed'
));

-- In an order Pact the orders set the target, not the budget lines.
CREATE OR REPLACE FUNCTION sync_target_to_budget(p uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total BIGINT; pr pacts%ROWTYPE;
BEGIN
  IF NOT is_organizer(p) THEN RAISE EXCEPTION 'not_organizer' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO pr FROM pacts WHERE id = p FOR UPDATE;
  IF pr.status <> 'open' THEN RAISE EXCEPTION 'pact_closed' USING ERRCODE = 'P0001'; END IF;
  IF pr.mode = 'orders' THEN RETURN pr.status; END IF;
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
