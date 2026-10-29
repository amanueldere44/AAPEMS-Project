import { useState } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  LockKeyhole,
  Mail,
  ShieldCheck,
  LoaderCircle,
} from 'lucide-react';
import { loginRequest } from '../services/api.js';

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300">
        <GraduationCap size={25} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-extrabold tracking-wide text-white">ASEMS</span>
        <span className="block text-xs font-semibold text-slate-200">Ambo University</span>
        <span className="mt-0.5 block text-[11px] text-slate-400">Academic Affairs Staff Evaluation System</span>
      </span>
    </div>
  );
}

export default function LoginPage({ user, onLogin }) {
  const location = useLocation();
  const selectedRole = location.state?.selectedRole;
  const expectedRole = location.state?.expectedRole;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);
    try {
      const result = await loginRequest(email.trim(), password, expectedRole);
      onLogin(result.data.user);
    } catch (err) {
      setError(err?.message || 'Unable to sign in. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="asems-login-page min-h-screen bg-slate-50 px-4 pb-12 text-slate-900 sm:px-6">
      <header className="asems-login-topbar sticky top-0 z-50 mx-auto flex min-h-[78px] w-full max-w-7xl items-center justify-between gap-4 rounded-b-xl bg-[#101827] px-4 py-4 text-white shadow-lg sm:px-7">
        <Brand />
        <nav className="flex shrink-0 items-center gap-2 sm:gap-4" aria-label="Login navigation">
          <Link to="/" className="asems-landing-nav-link rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold transition hover:border-emerald-300/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
            Home
          </Link>
        </nav>
      </header>

      <div className="mx-auto mt-12 w-full max-w-md sm:mt-16">
        <section className="asems-login-card overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_80px_-35px_rgba(15,23,42,0.3)]">
          <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-sky-400" />
          <div className="asems-login-form-panel p-6 sm:p-9">
            <div className="mb-8 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <ShieldCheck size={24} aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-950">Account sign in</h1>
                <p className="mt-1 text-xs text-slate-500">Authorized university access</p>{selectedRole && <p className="mt-2 inline-flex max-w-full rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Access category: {selectedRole}</p>}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
                <div className="group relative">
                  <Mail size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    required
                    maxLength={255}
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); if (error) setError(''); }}
                    placeholder="you@university.edu.et"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'login-error' : undefined}
                    className="h-[3.25rem] w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label>
                <div className="group relative">
                  <LockKeyhole size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); if (error) setError(''); }}
                    placeholder="Enter your password"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'login-error' : undefined}
                    className="h-[3.25rem] w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-11 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                  />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500">
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {error && (
                <div id="login-error" role="alert" aria-live="polite" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">
                  <ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <p>{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading} className="group flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl bg-[#101827] px-4 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 focus-visible:ring-4 focus-visible:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <><LoaderCircle size={18} className="animate-spin" aria-hidden="true" /><span>Signing in...</span></> : <><span>Sign in</span><ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></>}
              </button>
            </form>
          </div>
        </section>
        <p className="mt-6 text-center text-xs text-slate-500">ASEMS · Ambo University</p>
      </div>
    </main>
  );
}
