import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/api';
import { useAuth } from '../auth/useAuth';

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

const inputCls = `w-full rounded-xl border border-hair bg-[#fafafa] px-3.5 py-2.5 text-[15px]
                  text-ink placeholder:text-ink-muted
                  focus:outline-none focus:bg-white focus:border-2 focus:border-indigo-600`;

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
      navigate('/dashboard', { replace: true });
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="devEmail" className="block text-[13px] font-medium text-ink-soft mb-1.5">
          Sign in as
        </label>
        <select
          id="devEmail"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={inputCls}
        >
          {DEV_USERS.map(u => (
            <option key={u.email} value={u.email}>{u.label}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-ink-muted">
          Roles are loaded from the database for each user.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-4 py-3">
          <p className="text-sm text-[#c0392b]">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-4 rounded-xl text-[15px] font-medium text-white
                   bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-xs text-ink-muted">
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
      navigate('/dashboard', { replace: true });
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
        <label htmlFor="email" className="block text-[13px] font-medium text-ink-soft mb-1.5">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={inputCls}
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-[13px] font-medium text-ink-soft mb-1.5">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          className={inputCls}
          placeholder="••••••••••"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-4 py-3">
          <p className="text-sm text-[#c0392b]">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 px-4 rounded-xl text-[15px] font-medium text-white
                   bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm text-ink-muted">
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
    navigate('/dashboard', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-hair p-9">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-indigo-600
                          flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          </div>
          <h1 className="text-[26px] font-semibold text-ink tracking-tight">TicketZilla</h1>
          <p className="text-[15px] text-ink-muted mt-1">Sign in to your workspace</p>
        </div>

        <RealLoginForm />

        {!IS_PROD && (
          <>
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-hair" />
              <span className="text-xs text-ink-muted whitespace-nowrap">or dev shortcut</span>
              <div className="h-px flex-1 bg-hair" />
            </div>
            <DevLoginForm />
          </>
        )}
      </div>
    </div>
  );
}
