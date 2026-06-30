// Token store backed by localStorage so the session survives a page reload.
// The axios interceptor reads it without needing React context. AuthContext is the
// single writer via setToken().
const STORAGE_KEY = 'tz_access_token';

let _token: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

export function getToken(): string | null {
  return _token;
}

export function setToken(token: string | null): void {
  _token = token;
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode / SSR) — in-memory token still works for the session.
  }
}
