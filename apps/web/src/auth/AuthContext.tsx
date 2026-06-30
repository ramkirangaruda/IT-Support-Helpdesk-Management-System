import { createContext, useCallback, useMemo, useState } from 'react';
import { getToken, setToken } from '../api/token';

export interface AuthUser {
  sub:   string;
  email: string;
  roles: string[];
  exp?:  number;
}

export interface AuthContextValue {
  user:    AuthUser | null;
  token:   string | null;
  login:   (token: string) => void;
  logout:  () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user:   null,
  token:  null,
  login:  () => {},
  logout: () => {},
});

function decodeJwt(token: string): AuthUser | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as AuthUser;
  } catch {
    return null;
  }
}

// On app load, restore the session from the persisted token — but only if it decodes
// and hasn't expired. An expired/invalid token is cleared so the user lands on /login.
function restoreSession(): { token: string | null; user: AuthUser | null } {
  const stored = getToken();
  if (!stored) return { token: null, user: null };
  const decoded = decodeJwt(stored);
  if (!decoded || (decoded.exp && decoded.exp * 1000 <= Date.now())) {
    setToken(null);
    return { token: null, user: null };
  }
  return { token: stored, user: decoded };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initial = restoreSession();
  const [token, setTokenState] = useState<string | null>(initial.token);
  const [user,  setUser]        = useState<AuthUser | null>(initial.user);

  const login = useCallback((newToken: string) => {
    const decoded = decodeJwt(newToken);
    setTokenState(newToken);
    setUser(decoded);
    setToken(newToken); // sync to axios interceptor
  }, []);

  const logout = useCallback(() => {
    setTokenState(null);
    setUser(null);
    setToken(null); // sync to axios interceptor
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, login, logout }),
    [user, token, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
