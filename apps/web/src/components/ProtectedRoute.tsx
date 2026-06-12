import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

interface Props {
  /** If provided, the user must have at least one of these roles. */
  roles?: string[];
  children: React.ReactNode;
}

export default function ProtectedRoute({ roles, children }: Props) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.some(r => user.roles.includes(r))) {
    // Authenticated but wrong role — fall back to the default authed view
    return <Navigate to="/tickets" replace />;
  }

  return <>{children}</>;
}
