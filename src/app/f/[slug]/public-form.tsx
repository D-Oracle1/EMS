'use client';

import { useState } from 'react';
import { CheckCircle2, Copy, Eye, Loader2, MessageCircle, Share2, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuestionField } from '@/components/forms/question-field';
import { submitFormResponse, type SubmitReceipt } from '@/actions/form.actions';
import { validateAnswers, type Answer, type FormQuestion } from '@/lib/forms';
import { GUARANTORS_REQUIRED } from '@/lib/customer-forms';
import { formatCurrency } from '@/lib/utils';

interface PublicFormProps {
  slug: string;
  form: { title: string; description: string | null; audience: 'PUBLIC' | 'STAFF'; questions: FormQuestion[]; purpose: string };
  preview: boolean;
  respondent: string | null;
  /** A guarantor form opened from a loan applicant's link. */
  guaranteeing: { reference: string; applicant: string; amount: string | null } | null;
  /** The staff member whose personal link this is, and their code. */
  sharedBy?: string | null;
  referralCode?: string;
}

export function PublicForm({ slug, form, preview, respondent, guaranteeing, sharedBy, referralCode }: PublicFormProps) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmitReceipt | null>(null);
  // A guarantor who came without the applicant's link types the application number.
  const [appRef, setAppRef] = useState('');
  const guarantorForm = form.purpose === 'GUARANTOR';
  const [failure, setFailure] = useState<string | null>(null);
  // Questions with an upload in flight. Submitting waits for them.
  const [uploading, setUploading] = useState<Set<string>>(new Set());

  const setBusy = (id: string, busy: boolean) =>
    setUploading((s) => {
      const next = new Set(s);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const setAnswer = (id: string, value: Answer) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    if (errors[id]) setErrors(({ [id]: _, ...rest }) => rest);
  };

  const focusFirstError = (errs: Record<string, string>) => {
    const first = form.questions.find((q) => errs[q.id]);
    if (first) document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) return;
    setFailure(null);

    // The same check the server runs, so mistakes show without a round trip.
    const local = validateAnswers(form.questions, answers);
    if (!local.ok) {
      setErrors(local.errors);
      focusFirstError(local.errors);
      return;
    }

    setSubmitting(true);
    try {
      const app = guaranteeing?.reference ?? (guarantorForm ? appRef : undefined);
      const result = await submitFormResponse(slug, answers, website, app, referralCode);
      if (result.success) {
        setDone(result.message ?? 'Thank you. Your response has been recorded.');
        setReceipt(result.data ?? null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        if (result.data?.errors) {
          setErrors(result.data.errors);
          focusFirstError(result.data.errors);
        }
        setFailure(result.error ?? 'Your response could not be saved.');
      }
    } catch {
      setFailure('Your response could not be sent. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="h-2 bg-gradient-to-r from-indigo-600 to-blue-600" />
        <div className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="mt-3 text-xl font-semibold">{form.title}</h1>
          <p className="mt-2 whitespace-pre-line text-muted-foreground">{done}</p>
          {receipt?.guaranteeing && (
            <p className="mt-2 text-sm text-muted-foreground">
              You are now a guarantor for <span className="font-medium text-foreground">{receipt.guaranteeing}</span>.
            </p>
          )}
          {receipt?.reference && (
            <div className="mx-auto mt-5 max-w-xs rounded-2xl border border-dashed px-4 py-3">
              <p className="text-xs text-muted-foreground">{guarantorForm ? 'Your reference' : 'Your application number'}</p>
              <p className="mt-0.5 select-all font-mono text-2xl font-bold tracking-wider">{receipt.reference}</p>
              <p className="mt-1 text-xs text-muted-foreground">Keep this. Quote it when you call or visit.</p>
            </div>
          )}
          {receipt?.fee && (
            <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
              {receipt.fee.basis === 'Registration fee' ? 'Registration fee' : `Processing fee (${receipt.fee.basis})`}:{' '}
              <span className="font-semibold text-foreground">{formatCurrency(receipt.fee.due)}</span>, non-refundable.
              Pay at the office and quote your number.
            </p>
          )}
        </div>
        {receipt?.reference && receipt.guarantorPath !== undefined && (
          <GuarantorLinks reference={receipt.reference} path={receipt.guarantorPath} />
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {preview && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <Eye className="h-4 w-4 shrink-0" />
          Preview of a draft. Open the form to start taking responses.
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="h-2 bg-gradient-to-r from-indigo-600 to-blue-600" />
        <div className="p-5 sm:p-6">
          <h1 className="break-words text-2xl font-bold tracking-tight">{form.title}</h1>
          {form.description && <p className="mt-2 whitespace-pre-line break-words text-muted-foreground">{form.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
            {respondent ? (
              <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Responding as {respondent}</span>
            ) : null}
            {sharedBy && (
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />Shared by your Hy-Link officer, {sharedBy}</span>
            )}
            {form.questions.some((q) => q.required) && <span><span className="text-rose-600">*</span> Required</span>}
          </div>
        </div>
      </div>

      {guaranteeing && (
        <div className="flex items-start gap-3 rounded-3xl border border-indigo-200 bg-indigo-50 p-5 text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-300" />
          <div className="min-w-0 text-sm">
            <p>
              You are filling this as a guarantor for <span className="font-semibold">{guaranteeing.applicant}</span>
              {guaranteeing.amount ? <>, for a loan of <span className="font-semibold">{guaranteeing.amount}</span></> : null}.
            </p>
            <p className="mt-1 text-xs opacity-80">Application number {guaranteeing.reference}</p>
          </div>
        </div>
      )}

      {guarantorForm && !guaranteeing && (
        <div className="rounded-3xl border bg-card p-5 shadow-sm">
          <label htmlFor="app-ref" className="block font-medium">Application number of the person you are guaranteeing</label>
          <p className="mt-1 text-sm text-muted-foreground">
            It starts with LA- and the applicant got it when they applied. If you do not have it, leave this empty and the office will link you.
          </p>
          <Input
            id="app-ref"
            className="mt-3 font-mono uppercase sm:w-60"
            placeholder="LA-XXXXXX"
            value={appRef}
            onChange={(e) => setAppRef(e.target.value)}
            disabled={preview}
            autoComplete="off"
          />
        </div>
      )}

      {form.questions.map((q) => (
        <div key={q.id} id={`q-${q.id}`}>
          <QuestionField
            question={q}
            value={answers[q.id]}
            onChange={(v) => setAnswer(q.id, v)}
            error={errors[q.id]}
            disabled={preview}
            slug={preview ? undefined : slug}
            onBusyChange={(busy) => setBusy(q.id, busy)}
          />
        </div>
      ))}

      {/* Honeypot: hidden from people, irresistible to form-filling bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {failure && (
        <p className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {failure}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="submit" size="lg" disabled={submitting || preview || uploading.size > 0} className="px-8">
          {(submitting || uploading.size > 0) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {uploading.size > 0 ? 'Uploading...' : 'Submit'}
        </Button>
        {!preview && Object.keys(answers).length > 0 && (
          <button
            type="button"
            onClick={() => { setAnswers({}); setErrors({}); }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear form
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * A loan applicant's next step: send the guarantor link to two people. On a
 * phone, Share opens the phone's own sheet; WhatsApp and Copy work anywhere.
 */
function GuarantorLinks({ reference, path }: { reference: string; path: string | null }) {
  if (!path) {
    return (
      <div className="border-t bg-muted/40 p-5 text-center text-sm">
        <p className="font-medium">Next: your {GUARANTORS_REQUIRED} guarantors</p>
        <p className="mt-1 text-muted-foreground">
          Each loan needs {GUARANTORS_REQUIRED} guarantors. Ask the office for the guarantor form, and give your guarantors your
          application number, {reference}.
        </p>
      </div>
    );
  }

  const url = `${window.location.origin}${path}`;
  const message = `Please stand as my guarantor for my Hy-Link Finance loan. Fill the guarantor form here (application ${reference}):`;
  const canShare = typeof navigator.share === 'function';

  const share = async () => {
    try {
      await navigator.share({ title: 'Guarantor form', text: message, url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error('Could not open sharing. Copy the link instead.');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it instead.');
    }
  };
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`, '_blank', 'noopener,noreferrer');

  return (
    <div className="space-y-3 border-t bg-indigo-50/60 p-5 dark:bg-indigo-500/5">
      <div className="text-center">
        <p className="font-semibold">Next: send this link to your {GUARANTORS_REQUIRED} guarantors</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Each guarantor fills the form from this link, and it comes straight to your application. Your loan is processed once
          both have filled it.
        </p>
      </div>
      <p className="select-all break-all rounded-xl border bg-background px-3 py-2 text-center font-mono text-xs">{url}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="success" onClick={whatsapp}><MessageCircle className="mr-2 h-4 w-4" />WhatsApp</Button>
        {canShare && <Button type="button" variant="secondary" onClick={share}><Share2 className="mr-2 h-4 w-4" />Share</Button>}
        <Button type="button" variant="secondary" onClick={copy}><Copy className="mr-2 h-4 w-4" />Copy link</Button>
      </div>
    </div>
  );
}
