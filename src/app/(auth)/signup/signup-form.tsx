'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { submitAccountEnquiry } from '@/actions/enquiry.actions';
import { AuthShell, FIELD_CLASS, BUTTON_CLASS } from '../auth-shell';

const INTERESTS = [
  'Savings account',
  'Fixed deposit',
  'Loan / debt financing',
  'Mutual funding',
  'Not sure yet',
];

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  interest: '',
  message: '',
  company: '', // honeypot
};

export function SignupForm() {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const result = await submitAccountEnquiry(form);
      if (result.success) {
        setDone(result.message ?? 'Thank you — we will be in touch shortly.');
        setForm(emptyForm);
      } else {
        setError(result.error ?? 'Something went wrong. Please try again.');
      }
    });
  };

  // ── Confirmation ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <AuthShell
        eyebrow="Enquiry received"
        title="We have your details"
        lede={done}
        panel={{
          eyebrow: 'What happens next',
          heading: (
            <>
              A person,
              <br />
              not a robot.
            </>
          ),
          body:
            'One of our account officers will call you to confirm your details and walk you ' +
            'through the paperwork. Once your account is open we will email your login.',
        }}
        footer={
          <p className="mt-8 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-orange-600 hover:text-orange-700">
              Log in
            </Link>
          </p>
        }
      >
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Enquiry submitted</p>
            <p className="mt-1 text-emerald-700">
              We typically respond within one business day.
            </p>
          </div>
        </div>
      </AuthShell>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <AuthShell
      eyebrow="Open an account"
      title="Let&rsquo;s get you started"
      lede="Tell us how to reach you and an account officer will take it from there. Accounts are opened by our team, so your login arrives by email once you are set up."
      panel={{
        eyebrow: 'Why we call first',
        heading: (
          <>
            Built on
            <br />
            real relationships.
          </>
        ),
        body:
          'Every account is opened by an officer who knows your file — so the paperwork is ' +
          'right the first time and you always have someone to ask.',
      }}
      footer={
        <p className="mt-8 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-orange-600 hover:text-orange-700">
            Log in
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="first" className="mb-2 block text-xs font-semibold text-slate-600">
              First name
            </label>
            <input
              id="first"
              name="first"
              autoComplete="given-name"
              required
              value={form.firstName}
              onChange={(e) => set('firstName')(e.target.value)}
              disabled={isPending}
              className={FIELD_CLASS}
              placeholder="Ada"
            />
          </div>
          <div>
            <label htmlFor="last" className="mb-2 block text-xs font-semibold text-slate-600">
              Last name
            </label>
            <input
              id="last"
              name="last"
              autoComplete="family-name"
              required
              value={form.lastName}
              onChange={(e) => set('lastName')(e.target.value)}
              disabled={isPending}
              className={FIELD_CLASS}
              placeholder="Okoro"
            />
          </div>
        </div>

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
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            disabled={isPending}
            className={FIELD_CLASS}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="phone" className="mb-2 block text-xs font-semibold text-slate-600">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            value={form.phone}
            onChange={(e) => set('phone')(e.target.value)}
            disabled={isPending}
            className={FIELD_CLASS}
            placeholder="+234 800 000 0000"
          />
        </div>

        <div>
          <label htmlFor="interest" className="mb-2 block text-xs font-semibold text-slate-600">
            What are you interested in?
          </label>
          <select
            id="interest"
            name="interest"
            value={form.interest}
            onChange={(e) => set('interest')(e.target.value)}
            disabled={isPending}
            className={FIELD_CLASS}
          >
            <option value="">Select an option</option>
            {INTERESTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="message" className="mb-2 block text-xs font-semibold text-slate-600">
            Anything else? <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="message"
            name="message"
            rows={3}
            value={form.message}
            onChange={(e) => set('message')(e.target.value)}
            disabled={isPending}
            className={`${FIELD_CLASS} resize-none`}
            placeholder="Tell us a little about what you need"
          />
        </div>

        {/* Honeypot — hidden from people, catches naive bots. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="company">Company</label>
          <input
            id="company"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={form.company}
            onChange={(e) => set('company')(e.target.value)}
          />
        </div>

        <button type="submit" disabled={isPending} className={`${BUTTON_CLASS} mt-2`}>
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending…
            </span>
          ) : (
            'Send enquiry'
          )}
        </button>

        <p className="pt-1 text-center text-xs text-slate-500">
          We use your details only to contact you about opening an account.
        </p>
      </form>
    </AuthShell>
  );
}
