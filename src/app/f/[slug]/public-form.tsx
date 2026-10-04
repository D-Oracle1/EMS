'use client';

import { useState } from 'react';
import { CheckCircle2, Eye, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuestionField } from '@/components/forms/question-field';
import { submitFormResponse } from '@/actions/form.actions';
import { validateAnswers, type Answer, type FormQuestion } from '@/lib/forms';

interface PublicFormProps {
  slug: string;
  form: { title: string; description: string | null; audience: 'PUBLIC' | 'STAFF'; questions: FormQuestion[] };
  preview: boolean;
  respondent: string | null;
}

export function PublicForm({ slug, form, preview, respondent }: PublicFormProps) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
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
      const result = await submitFormResponse(slug, answers, website);
      if (result.success) {
        setDone(result.message ?? 'Thank you. Your response has been recorded.');
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
        </div>
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
            {form.questions.some((q) => q.required) && <span><span className="text-rose-600">*</span> Required</span>}
          </div>
        </div>
      </div>

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
