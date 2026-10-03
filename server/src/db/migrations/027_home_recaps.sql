-- Home V2 and Recaps. A recap is derived from the finished Plan, Pact or Split; the only thing stored is an optional share link,
-- made on purpose by the organiser and revocable. Service-only: the app role never reads this table.

CREATE TABLE recap_links (
  token       TEXT PRIMARY KEY CHECK (char_length(token) >= 32),
  kind        TEXT NOT NULL CHECK (kind IN ('plan', 'pact', 'split')),
  object_id   UUID NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX recap_links_one_active ON recap_links (kind, object_id) WHERE revoked_at IS NULL;
ALTER TABLE recap_links ENABLE ROW LEVEL SECURITY;

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
  'ask_response_completed_from_share', 'circle_join_prompt_shown', 'circle_joined_from_ask', 'ask_reshared',
  'plan_created', 'plan_opened', 'plan_shared', 'plan_rsvp_submitted', 'plan_rsvp_changed', 'plan_task_created',
  'plan_task_completed', 'plan_ask_linked', 'plan_confirmed', 'plan_conversion_started', 'plan_converted_to_pact',
  'split_created', 'split_opened', 'split_shared', 'split_share_opened', 'split_settlement_marked', 'split_settlement_undone',
  'split_completed', 'split_cancelled', 'circle_joined_from_split',
  'home_viewed', 'home_needs_you_opened', 'home_needs_you_actioned', 'circle_opened_from_home', 'coming_up_opened', 'recent_activity_opened', 'recap_viewed', 'recap_shared', 'recap_share_opened'
));
