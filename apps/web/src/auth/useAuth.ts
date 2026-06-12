import { useContext } from 'react';
import { AuthContext, AuthContextValue } from './AuthContext';

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
