/**
 * Token storage.
 *
 * Tradeoff note: the ideal place to store an auth token on the web is an
 * httpOnly, Secure, SameSite cookie set by the backend on login — that keeps
 * the token completely out of reach of client-side JavaScript (and therefore
 * XSS). This is a pure client-side SPA talking to a separate API origin, so
 * we don't control cookie issuance from here.
 *
 * As a pragmatic middle ground we keep the token in an in-memory variable for
 * all runtime reads/writes (so a compromised third-party script can't just
 * read it out of localStorage on every page), and mirror it into
 * localStorage purely so the session survives a full page reload/tab close.
 * This is strictly a fallback — anything in localStorage is readable by any
 * script on the page, so it does not protect against XSS. A production
 * deployment should move to backend-issued httpOnly cookies + a CSRF token
 * instead.
 */

const STORAGE_KEY = "crm_auth_token";

let memoryToken: string | null = null;

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  memoryToken = stored;
  return stored;
}

export function setToken(token: string): void {
  memoryToken = token;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, token);
  }
}

export function clearToken(): void {
  memoryToken = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  // Also clear the lightweight cookie used by the proxy for route gating.
  if (typeof document !== "undefined") {
    document.cookie = "crm_auth_present=; Max-Age=0; path=/";
  }
}

/**
 * proxy.ts runs on the edge and cannot read localStorage, so we mirror
 * a non-sensitive "is authenticated" flag into a regular (non-httpOnly)
 * cookie purely for route-protection purposes. It never holds the real
 * token.
 */
export function markAuthPresence(present: boolean): void {
  if (typeof document === "undefined") return;
  if (present) {
    document.cookie = "crm_auth_present=1; path=/; max-age=2592000; samesite=lax";
  } else {
    document.cookie = "crm_auth_present=; Max-Age=0; path=/";
  }
}
