// Current-user context for the UI. The session itself is an HttpOnly cookie the UI never sees.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserDto } from '../shared/types.js';
import { api } from './api.js';

interface AuthValue {
  user: UserDto | null;
  loading: boolean;
  setUser: (u: UserDto | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({ user: null, loading: true, setUser: () => undefined, signOut: async () => undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ user: UserDto }>('GET', '/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  const signOut = useCallback(async () => {
    await api('POST', '/api/auth/logout', {});
    setUser(null);
  }, []);
  const value = useMemo(() => ({ user, loading, setUser, signOut }), [user, loading, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
