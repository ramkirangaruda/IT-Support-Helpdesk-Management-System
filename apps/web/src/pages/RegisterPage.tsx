import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/api';

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-[#c0392b]">{msg}</p>;
}

interface FormErrors {
  name?:            string;
  email?:           string;
  password?:        string;
  confirmPassword?: string;
  department?:      string;
}

function validate(fields: {
  name: string; email: string; password: string; confirmPassword: string; department: string;
}): FormErrors {
  const errors: FormErrors = {};
  if (!fields.name.trim())            errors.name = 'Name is required';
  if (fields.name.length > 100)       errors.name = 'Name must be 100 characters or fewer';
  if (!fields.email.trim())           errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
                                      errors.email = 'Enter a valid email address';
  if (fields.password.length < 10)    errors.password = 'Password must be at least 10 characters';
  else if (!/[A-Za-z]/.test(fields.password))
                                      errors.password = 'Password must contain at least one letter';
  else if (!/\d/.test(fields.password))
                                      errors.password = 'Password must contain at least one number';
  if (fields.confirmPassword !== fields.password)
                                      errors.confirmPassword = 'Passwords do not match';
  if (!fields.department.trim())      errors.department = 'Department is required';
  if (fields.department.length > 100) errors.department = 'Department must be 100 characters or fewer';
  return errors;
}

const inputCls = `w-full rounded-lg border border-hair px-3 py-2 text-sm text-ink bg-white
                  placeholder:text-ink-muted
                  focus:outline-none focus:border-2 focus:border-indigo-600`;

export default function RegisterPage() {
  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [department,      setDepartment]      = useState('');
  const [errors,          setErrors]          = useState<FormErrors>({});
  const [apiError,        setApiError]        = useState<string | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [success,         setSuccess]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    const fieldErrors = validate({ name, email, password, confirmPassword, department });
    if (Object.keys(fieldErrors).length > 0) { setErrors(fieldErrors); return; }
    setErrors({});
    setLoading(true);
    try {
      await api.post('/auth/register', { name, email, password, department });
      setSuccess(true);
    } catch (err: unknown) {
      const raw =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join('. ') : (raw ?? 'Registration failed. Please try again.');
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-xl border border-hair p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[#eafaf3] flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#1a7f4b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-ink mb-2">Account created</h2>
          <p className="text-sm text-ink-soft mb-1">
            Your account is <strong>pending admin approval</strong>.
          </p>
          <p className="text-sm text-ink-muted mb-6">
            An IT administrator will review your request. Once approved, you can sign in —
            your approval will appear in your notifications.
          </p>
          <Link to="/login" className="text-sm text-indigo-600 hover:underline font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm bg-white rounded-xl border border-hair p-8">
        <div className="text-center mb-7">
          <h1 className="text-[22px] font-semibold text-ink">TicketZilla</h1>
          <p className="text-sm text-ink-muted mt-1">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-ink-soft mb-1">
              Full name <span className="text-[#c0392b]">*</span>
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
              placeholder="Jane Smith"
            />
            <FieldError msg={errors.name} />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink-soft mb-1">
              Email address <span className="text-[#c0392b]">*</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputCls}
              placeholder="jane@company.com"
            />
            <FieldError msg={errors.email} />
          </div>

          <div>
            <label htmlFor="department" className="block text-sm font-medium text-ink-soft mb-1">
              Department <span className="text-[#c0392b]">*</span>
            </label>
            <input
              id="department"
              type="text"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              className={inputCls}
              placeholder="Engineering"
            />
            <FieldError msg={errors.department} />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink-soft mb-1">
              Password <span className="text-[#c0392b]">*</span>
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className={inputCls}
              placeholder="Min 10 chars, at least one letter and number"
            />
            <FieldError msg={errors.password} />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink-soft mb-1">
              Confirm password <span className="text-[#c0392b]">*</span>
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••••"
            />
            <FieldError msg={errors.confirmPassword} />
          </div>

          {apiError && (
            <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-4 py-3">
              <p className="text-sm text-[#c0392b]">{apiError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white
                       bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-sm text-ink-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
