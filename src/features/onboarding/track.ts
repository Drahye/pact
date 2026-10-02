import { api } from '../../api/client';

/**
 * What someone looked at or chose in the first-time experience. Only a name and a few fixed choices are sent (never a
 * Pact's name, an invite code or anything typed), the server accepts nothing else, and a failure is ignored: analytics
 * must never get in the way of the screen.
 */
export type OnboardingEvent = 'onboarding_started' | 'onboarding_completed' | 'onboarding_intent_selected' | 'demo_pact_opened' | 'demo_pact_completed_view' | 'first_pact_started';

export function trackOnboarding(name: OnboardingEvent, props?: Record<string, string | boolean | number>) {
  void api('POST', '/me/onboarding-event', { name, props }).catch(() => undefined);
}
