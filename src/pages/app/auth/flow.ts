/** Sign-in progress survives a refresh or a trip to the SMS app. Nothing secret is kept here. */
export interface AuthFlow {
  phone?: string;
  displayPhone?: string;
  devCode?: string;
  signupToken?: string;
  firstName?: string;
  lastName?: string;
  referralCode?: string;
}

const KEY = 'pact.authFlow';
const RETURN_KEY = 'pact.returnTo';

export const readFlow = (): AuthFlow => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as AuthFlow;
  } catch {
    return {};
  }
};

export const writeFlow = (patch: AuthFlow) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...readFlow(), ...patch }));
  } catch {
    /* storage unavailable: the flow still works within this page */
  }
};

export const clearFlow = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

/** Where to go after signing in, e.g. back to an invite link. Only in-app paths are accepted. */
export const setReturnTo = (path: string | undefined) => {
  try {
    const safe = safeAppPath(path);
    if (safe && !safe.startsWith('/app/auth')) sessionStorage.setItem(RETURN_KEY, safe);
  } catch {
    /* ignore */
  }
};

/** Where a freshly signed-in person should land. Read by the guest-only guard, cleared once they arrive. */
export const peekReturnTo = () => {
  try {
    return safeAppPath(sessionStorage.getItem(RETURN_KEY)) ?? '/app/home';
  } catch {
    return '/app/home';
  }
};

export const clearReturnTo = () => {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* ignore */
  }
};

export const takeReturnTo = () => {
  try {
    const p = safeAppPath(sessionStorage.getItem(RETURN_KEY));
    sessionStorage.removeItem(RETURN_KEY);
    return p ?? '/app/home';
  } catch {
    return '/app/home';
  }
};

/**
 * Only same-app paths are ever navigated to from a URL parameter or storage: no other
 * origins, no protocol-relative or backslash tricks.
 */
export const safeAppPath = (raw: string | null | undefined): string | null =>
  raw && (/^\/app\/[A-Za-z0-9/_\-?=&%.]*$/.test(raw) || /^\/[apsr]\/[A-Za-z0-9_-]{16,64}$/.test(raw)) && !raw.includes('//') && !raw.includes('\\') ? raw : null;
