-- Installing PACT from the website: started and completed, sent by the app for signed-in people. No props, no identity.
ALTER TABLE product_events DROP CONSTRAINT product_events_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_name_check CHECK (name IN (
  'pact_created', 'invite_created', 'invite_previewed', 'signup_completed', 'pact_joined',
  'participation_selected', 'contribution_completed', 'task_claimed', 'task_completed',
  'pact_funded', 'pact_completed', 'memory_added', 'second_pact_created',
  'pact_execution_started', 'pact_payment_completed', 'pact_outcome_completed',
  'pact_update_posted', 'activity_commented', 'activity_reacted', 'activity_pinned',
  'onboarding_started', 'onboarding_completed', 'onboarding_intent_selected', 'demo_pact_opened', 'demo_pact_completed_view',
  'first_pact_started', 'first_pact_created', 'first_invite_created', 'first_pact_joined',
  'pwa_install_started', 'pwa_install_completed'
));
