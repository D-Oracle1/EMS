'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { AuthShell, FIELD_CLASS, BUTTON_CLASS } from '../auth-shell';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Codes are raised in src/lib/auth.ts. Anything unrecognised — including a
  // genuinely wrong password — falls through to the neutral message below, so
  // the screen never hints at which half of the credentials was wrong.
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const SIGN_IN_MESSAGES: Record<string, string> = {
    account_locked:
      'This account is locked after too many failed attempts. Wait for the lockout to pass, or ask an administrator to unlock it. Trying again now extends the lock.',
    account_inactive: 'This account is not active. Contact an administrator.',
    signin_unavailable:
      'Could not reach the sign-in service. This is not your password — try again in a moment.',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Auth.js puts the reason in `code`; `error` is only ever the class
        // name. Echoing `error` raw is how a locked account used to reach this
        // screen as the bare word "Configuration".
        const code = (result as { code?: string }).code;
        setError(SIGN_IN_MESSAGES[code ?? ''] ?? 'Invalid email or password');
      } else {
        // With no explicit callback, hand off to '/', which resolves the
        // right home for this user server-side (HR staff open onto /hr).
        router.push(callbackUrl || '/');
        router.refresh();
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in to your account"
      lede="Access your savings, deposits and financing dashboard."
      footer={
        <p className="mt-8 text-center text-sm text-slate-600">
          New to HY-LINK?{' '}
          <Link
            href="/signup"
            className="font-semibold text-orange-600 hover:text-orange-700"
          >
            Open an account
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-2 block text-xs font-semibold text-slate-600">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className={FIELD_CLASS}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-xs font-semibold text-slate-600">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className={`${FIELD_CLASS} pr-12`}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-4 text-slate-400 transition hover:text-slate-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading} className={`${BUTTON_CLASS} mt-2`}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in…
            </span>
          ) : (
            'Log in'
          )}
        </button>

        <p className="pt-1 text-center text-xs text-slate-500">
          Forgotten your password? Contact your administrator, or call us and we will reset it
          for you.
        </p>
      </form>
    </AuthShell>
  );
}
