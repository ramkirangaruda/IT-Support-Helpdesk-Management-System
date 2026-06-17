import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/api';
import { useAuth } from '../auth/useAuth';

// Seed users — dev-login only (shown when import.meta.env.MODE !== 'production')
const DEV_USERS = [
  { email: 'employee@test.com', label: 'Test Employee (EMPLOYEE)' },
  { email: 'agent@test.com',    label: 'Test Agent (AGENT)' },
  { email: 'l2@test.com',       label: 'Test L2/L3 Engineer (L2_L3)' },
  { email: 'admin@test.com',    label: 'Test IT Admin (IT_ADMIN)' },
  { email: 'manager@test.com',  label: 'Test Manager (MANAGER)' },
  { email: 'finance@test.com',  label: 'Test Finance (FINANCE)' },
  { email: 'sysadmin@test.com', label: 'Test SysAdmin (SYS_ADMIN)' },
];

const IS_PROD = import.meta.env.MODE === 'production';

// ── Dev login form ──────────────────────────────────────────────────────────

function DevLoginForm() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email,   setEmail]   = useState(DEV_USERS[0].email);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="devEmail" className="block text-sm font-medium text-gray-700 mb-1">
          Sign in as
        </label>
        <select
          id="devEmail"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          {DEV_USERS.map(u => (
            <option key={u.email} value={u.email}>{u.label}</option>
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

      <p className="text-center text-xs text-gray-400">
        Development mode only — not available in production
      </p>
    </form>
  );
}

// ── Real email/password login form ──────────────────────────────────────────

function RealLoginForm() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ access_token: string }>('/auth/login', { email, password });
      login(res.data.access_token);
      navigate('/tickets', { replace: true });
    } catch (err: unknown) {
      const raw =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('. ') : (raw ?? 'Login failed. Please try again.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="••••••••••"
        />
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

      <p className="text-center text-sm text-gray-500">
        New to TicketZilla?{' '}
        <Link to="/register" className="text-indigo-600 hover:underline font-medium">
          Create an account
        </Link>
      </p>
    </form>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    navigate('/tickets', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">TicketZilla</h1>
          <p className="text-sm text-gray-500 mt-1">
            IT Help Desk{IS_PROD ? '' : ' — Dev Login'}
          </p>
        </div>

        {IS_PROD ? <RealLoginForm /> : <DevLoginForm />}
      </div>
    </div>
  );
}
