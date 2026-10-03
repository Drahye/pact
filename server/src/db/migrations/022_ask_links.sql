-- Shared Ask links as an acquisition path.
--   ask_revoked_links  tokens that used to work. A reset replaces the Ask's token and remembers the old one here, so an old
--                      link can say "no longer active" (and reveal nothing) instead of looking like a typo.
--   events             the shared-link funnel: opened, answer chosen, sign-in started and finished, saved, join prompt, joined, reshared.

CREATE TABLE ask_revoked_links (
  token       TEXT PRIMARY KEY CHECK (char_length(token) >= 32),
  ask_id      UUID NOT NULL REFERENCES asks(id) ON DELETE CASCADE,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ask_revoked_links_ask_idx ON ask_revoked_links (ask_id);
ALTER TABLE ask_revoked_links ENABLE ROW LEVEL SECURITY; -- service only: pact_app has no grants

ALTER TABLE product_events DROP CONSTRAINT product_events_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_name_check CHECK (name IN (
  'pact_created', 'invite_created', 'invite_previewed', 'signup_completed', 'pact_joined',
  'participation_selected', 'contribution_completed', 'task_claimed', 'task_completed',
  'pact_funded', 'pact_completed', 'memory_added', 'second_pact_created',
  'pact_execution_started', 'pact_payment_completed', 'pact_outcome_completed',
  'pact_update_posted', 'activity_commented', 'activity_reacted', 'activity_pinned',
  'onboarding_started', 'onboarding_completed', 'onboarding_intent_selected', 'demo_pact_opened', 'demo_pact_completed_view',
  'first_pact_started', 'first_pact_created', 'first_invite_created', 'first_pact_joined',
  'pwa_install_started', 'pwa_install_completed',
  'circle_created', 'circle_joined', 'circle_invite_created', 'circle_invite_opened', 'circle_invite_shared', 'universal_create_opened',
  'ask_created', 'ask_shared', 'ask_opened', 'ask_response_started', 'ask_responded', 'ask_changed_response', 'ask_closed',
  'ask_shared_link_opened', 'ask_public_response_selected', 'ask_auth_started_from_share', 'ask_auth_completed_from_share',
  'ask_response_completed_from_share', 'circle_join_prompt_shown', 'circle_joined_from_ask', 'ask_reshared'
));
