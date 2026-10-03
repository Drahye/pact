/**
 * One answer to "where does Start a Pact go?", used everywhere that button appears.
 *
 *  - Converting a Plan always uses the full form (`/app/create?plan=`): it carries the Plan's draft and the review step.
 *  - Someone who has never organised a Pact gets the guided start (`/app/start`): three short questions.
 *  - Everyone else gets the full form (`/app/create`).
 *  - Until Pacts have loaded we can't tell, so the full form is used; it works for everyone.
 *
 * A Circle (`?circle=`) is kept on either path.
 */
export interface StartPactOptions {
  circleId?: string;
  planId?: string;
  /** null while still loading. */
  hasCreated: boolean | null;
}

export function startPactPath({ circleId, planId, hasCreated }: StartPactOptions): string {
  if (planId) return `/app/create?plan=${planId}`;
  const q = circleId ? `?circle=${circleId}` : '';
  return hasCreated === false ? `/app/start${q}` : `/app/create${q}`;
}
