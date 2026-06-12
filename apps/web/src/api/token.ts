// Module-level token store so the axios interceptor can read the current JWT
// without needing access to React context.  AuthContext is the single writer.
let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export function setToken(token: string | null): void {
  _token = token;
}
