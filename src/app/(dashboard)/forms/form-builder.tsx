'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowDown, ArrowUp, Copy, Eye, Globe2, Loader2, Plus, Save, Trash2, Users, X, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { saveForm, type FormInput } from '@/actions/form.actions';
import {
  QUESTION_TYPES, QUESTION_TYPE_LABEL, blankQuestion, hasOptions, newQuestionId, normalizeQuestions,
  type FormQuestion, type QuestionType,
} from '@/lib/forms';

export interface BuilderForm {
  id?: string;
  slug?: string;
  title: string;
  description: string;
  audience: 'PUBLIC' | 'STAFF';
  confirmationMessage: string;
  oneResponsePerStaff: boolean;
  closesAt: string | null;
  questions: FormQuestion[];
  responseCount?: number;
}

export const EMPTY_FORM: BuilderForm = {
  title: '',
  description: '',
  audience: 'PUBLIC',
  confirmationMessage: '',
  oneResponsePerStaff: false,
  closesAt: null,
  questions: [blankQuestion('SHORT_TEXT')],
};

/** `datetime-local` wants local time without a zone; the server stores UTC. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function FormBuilder({ initial }: { initial: BuilderForm }) {
  const router = useRouter();
  const [form, setForm] = useState<BuilderForm>(initial);
  const [saving, setSaving] = useState(false);
  const isNew = !initial.id;

  const set = <K extends keyof BuilderForm>(key: K, value: BuilderForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const updateQuestion = (id: string, patch: Partial<FormQuestion>) =>
    setForm((f) => ({ ...f, questions: f.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));

  const changeType = (q: FormQuestion, type: QuestionType) => {
    const patch: Partial<FormQuestion> = { type };
    if (hasOptions(type) && !(q.options && q.options.length)) patch.options = ['Option 1'];
    if (type === 'SCALE' && q.scaleMax == null) Object.assign(patch, { scaleMin: 1, scaleMax: 5 });
    updateQuestion(q.id, patch);
  };

  const move = (index: number, by: -1 | 1) =>
    setForm((f) => {
      const next = [...f.questions];
      const target = index + by;
      if (target < 0 || target >= next.length) return f;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...f, questions: next };
    });

  const duplicate = (index: number) =>
    setForm((f) => {
      const next = [...f.questions];
      next.splice(index + 1, 0, { ...f.questions[index], id: newQuestionId(), options: f.questions[index].options?.slice() });
      return { ...f, questions: next };
    });

  const remove = (id: string) => setForm((f) => ({ ...f, questions: f.questions.filter((q) => q.id !== id) }));

  const addQuestion = () => {
    const q = blankQuestion('SHORT_TEXT');
    setForm((f) => ({ ...f, questions: [...f.questions, q] }));
    // Bring the new card into view once it renders.
    setTimeout(() => document.getElementById(`label-${q.id}`)?.focus(), 50);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error('Give the form a title');
    try {
      normalizeQuestions(form.questions);
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : 'Check the questions');
    }

    setSaving(true);
    const input: FormInput = {
      title: form.title,
      description: form.description,
      audience: form.audience,
      confirmationMessage: form.confirmationMessage,
      oneResponsePerStaff: form.oneResponsePerStaff,
      closesAt: form.closesAt,
      questions: form.questions,
    };
    const result = await saveForm(input, form.id);
    setSaving(false);
    if (!result.success || !result.data) return toast.error(result.error ?? 'Could not save');
    toast.success(result.message);
    if (isNew) router.push(`/forms/${result.data.id}`);
    else router.refresh();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={form.id ? `/forms/${form.id}` : '/forms'}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{isNew ? 'New form' : 'Edit form'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {form.slug && (
            <Button variant="outline" asChild>
              <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer"><Eye className="mr-2 h-4 w-4" />Preview</a>
            </Button>
          )}
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isNew ? 'Create form' : 'Save'}
          </Button>
        </div>
      </div>

      {!!initial.responseCount && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This form already has {initial.responseCount} response{initial.responseCount === 1 ? '' : 's'}. Rewording is safe; a deleted
          question disappears from the responses page and export, and renamed options no longer match earlier answers.
        </p>
      )}

      {/* Title and settings */}
      <Card className="overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-indigo-600 to-blue-600" />
        <CardContent className="space-y-4 p-5">
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Form title"
            maxLength={150}
            className="h-12 border-0 border-b px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
          />
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Description (optional): what this form is for"
            rows={2}
            maxLength={2000}
          />

          <div className="space-y-2">
            <Label>Who can respond</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <AudienceOption
                active={form.audience === 'PUBLIC'}
                onClick={() => set('audience', 'PUBLIC')}
                icon={Globe2}
                title="Anyone with the link"
                body="Customers, applicants, anyone. No sign-in needed."
              />
              <AudienceOption
                active={form.audience === 'STAFF'}
                onClick={() => set('audience', 'STAFF')}
                icon={Users}
                title="Staff only"
                body="Signed-in staff. Responses carry their name, and it appears under My Forms."
              />
            </div>
          </div>

          {form.audience === 'STAFF' && (
            <label className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
              <span>
                <span className="block text-sm font-medium">One response per person</span>
                <span className="block text-xs text-muted-foreground">Each staff member can submit once.</span>
              </span>
              <Switch checked={form.oneResponsePerStaff} onCheckedChange={(v) => set('oneResponsePerStaff', v)} />
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="closesAt">Stop taking responses (optional)</Label>
              <Input
                id="closesAt"
                type="datetime-local"
                value={toLocalInput(form.closesAt)}
                onChange={(e) => set('closesAt', e.target.value ? new Date(e.target.value).toISOString() : null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmation">Message after submitting (optional)</Label>
              <Input
                id="confirmation"
                value={form.confirmationMessage}
                onChange={(e) => set('confirmationMessage', e.target.value)}
                placeholder="Thank you. Your response has been recorded."
                maxLength={1000}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      {form.questions.map((q, index) => (
        <Card key={q.id}>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <span className="mt-2.5 w-6 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{index + 1}.</span>
                <Textarea
                  id={`label-${q.id}`}
                  value={q.label}
                  onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                  placeholder="Question"
                  rows={1}
                  maxLength={300}
                  className="min-h-10 resize-y font-medium"
                />
              </div>
              <select
                value={q.type}
                onChange={(e) => changeType(q, e.target.value as QuestionType)}
                className={cn(selectClass, 'sm:w-48')}
                aria-label="Question type"
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>

            <Input
              value={q.help ?? ''}
              onChange={(e) => updateQuestion(q.id, { help: e.target.value })}
              placeholder="Hint (optional)"
              maxLength={500}
              className="text-sm"
            />

            {hasOptions(q.type) && <OptionsEditor q={q} onChange={(options) => updateQuestion(q.id, { options })} />}
            {q.type === 'SCALE' && <ScaleEditor q={q} onChange={(patch) => updateQuestion(q.id, patch)} />}
            {!hasOptions(q.type) && q.type !== 'SCALE' && (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                {QUESTION_TYPE_LABEL[q.type]} answer
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="flex items-center gap-0.5">
                <IconButton label="Move up" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></IconButton>
                <IconButton label="Move down" onClick={() => move(index, 1)} disabled={index === form.questions.length - 1}><ArrowDown className="h-4 w-4" /></IconButton>
                <IconButton label="Duplicate" onClick={() => duplicate(index)}><Copy className="h-4 w-4" /></IconButton>
                <IconButton label="Delete" onClick={() => remove(q.id)} className="hover:text-rose-600"><Trash2 className="h-4 w-4" /></IconButton>
              </div>
              <label className="flex items-center gap-2 text-sm">
                Required
                <Switch checked={q.required} onCheckedChange={(v) => updateQuestion(q.id, { required: v })} />
              </label>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={addQuestion} className="border-dashed">
          <Plus className="mr-2 h-4 w-4" />Add question
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isNew ? 'Create form' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function AudienceOption({ active, onClick, icon: Icon, title, body }: {
  active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
        active ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-500/15' : 'hover:bg-muted/60'
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', active ? 'text-indigo-600' : 'text-muted-foreground')} />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

function IconButton({ label, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        className
      )}
      {...props}
    />
  );
}

function OptionsEditor({ q, onChange }: { q: FormQuestion; onChange: (options: string[]) => void }) {
  const options = q.options ?? [];
  const marker = q.type === 'CHECKBOXES' ? 'rounded-sm' : q.type === 'MULTIPLE_CHOICE' ? 'rounded-full' : '';
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          {marker ? (
            <span className={cn('h-4 w-4 shrink-0 border-2 border-muted-foreground/50', marker)} />
          ) : (
            <span className="w-4 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{i + 1}.</span>
          )}
          <Input
            value={o}
            onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onChange([...options.slice(0, i + 1), '', ...options.slice(i + 1)]);
              }
            }}
            placeholder={`Option ${i + 1}`}
            maxLength={200}
            className="h-9"
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            disabled={options.length <= 1}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            aria-label="Remove option"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, `Option ${options.length + 1}`])}
        className="ml-6 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Add option
      </button>
    </div>
  );
}

function ScaleEditor({ q, onChange }: { q: FormQuestion; onChange: (patch: Partial<FormQuestion>) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex items-center gap-2">
        <select value={q.scaleMin ?? 1} onChange={(e) => onChange({ scaleMin: Number(e.target.value) })} className={cn(selectClass, 'w-20')} aria-label="Scale starts at">
          <option value={0}>0</option>
          <option value={1}>1</option>
        </select>
        <span className="text-sm text-muted-foreground">to</span>
        <select value={q.scaleMax ?? 5} onChange={(e) => onChange({ scaleMax: Number(e.target.value) })} className={cn(selectClass, 'w-20')} aria-label="Scale ends at">
          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input value={q.scaleMinLabel ?? ''} onChange={(e) => onChange({ scaleMinLabel: e.target.value })} placeholder="Low label" maxLength={60} className="h-10" />
        <Input value={q.scaleMaxLabel ?? ''} onChange={(e) => onChange({ scaleMaxLabel: e.target.value })} placeholder="High label" maxLength={60} className="h-10" />
      </div>
    </div>
  );
}
