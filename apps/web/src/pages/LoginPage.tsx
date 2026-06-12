import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';
import { useAuth } from '../auth/useAuth';

// Seed users from apps/api/prisma seed — email only; dev-login looks up roles from DB
const DEV_USERS = [
  { email: 'employee@test.com', label: 'Test Employee (EMPLOYEE)' },
  { email: 'agent@test.com',    label: 'Test Agent (AGENT)' },
  { email: 'l2@test.com',       label: 'Test L2/L3 Engineer (L2_L3)' },
  { email: 'admin@test.com',    label: 'Test IT Admin (IT_ADMIN)' },
  { email: 'manager@test.com',  label: 'Test Manager (MANAGER)' },
  { email: 'finance@test.com',  label: 'Test Finance (FINANCE)' },
  { email: 'sysadmin@test.com', label: 'Test SysAdmin (SYS_ADMIN)' },
];

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail]     = useState(DEV_USERS[0].email);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Already logged in → go straight to tickets
  if (user) {
    navigate('/tickets', { replace: true });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ access_token: string }>('/auth/dev-login', { email });
      login(res.data.access_token);
      navigate('/tickets', { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? 'Login failed. Check the API is running.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">TicketZilla</h1>
          <p className="text-sm text-gray-500 mt-1">IT Help Desk — Dev Login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Sign in as
            </label>
            <select
              id="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                         bg-white text-gray-900"
            >
              {DEV_USERS.map(u => (
                <option key={u.email} value={u.email}>
                  {u.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-400">
              Roles are loaded from the database for each user.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white
                       bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                       disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Development mode only — not available in production
        </p>
      </div>
    </div>
  );
}
