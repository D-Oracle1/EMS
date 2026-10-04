'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Answer, FormQuestion } from '@/lib/forms';

interface QuestionFieldProps {
  question: FormQuestion;
  value: Answer | undefined;
  onChange: (value: Answer) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * One question as the person answering sees it. Used by the share page and by
 * the builder's preview, so what an admin previews is what people get.
 */
export function QuestionField({ question: q, value, onChange, error, disabled }: QuestionFieldProps) {
  const id = `field-${q.id}`;
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const list = Array.isArray(value) ? value : [];

  return (
    <fieldset
      className={cn(
        'rounded-2xl border bg-card p-4 shadow-sm sm:p-5',
        error ? 'border-rose-400 dark:border-rose-500/70' : 'border-border'
      )}
      aria-invalid={!!error}
    >
      <legend className="sr-only">{q.label}</legend>
      <label htmlFor={hasSingleInput(q) ? id : undefined} className="block text-[15px] font-medium leading-snug">
        {q.label}
        {q.required && <span className="ml-1 text-rose-600" aria-hidden>*</span>}
      </label>
      {q.help && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{q.help}</p>}

      <div className="mt-3">
        {q.type === 'SHORT_TEXT' && (
          <Input id={id} value={text} disabled={disabled} maxLength={500} placeholder="Your answer"
            onChange={(e) => onChange(e.target.value)} />
        )}
        {q.type === 'PARAGRAPH' && (
          <Textarea id={id} value={text} disabled={disabled} maxLength={5000} rows={4} placeholder="Your answer"
            onChange={(e) => onChange(e.target.value)} />
        )}
        {q.type === 'EMAIL' && (
          <Input id={id} type="email" inputMode="email" autoComplete="email" value={text} disabled={disabled}
            placeholder="name@example.com" onChange={(e) => onChange(e.target.value)} />
        )}
        {q.type === 'PHONE' && (
          <Input id={id} type="tel" inputMode="tel" autoComplete="tel" value={text} disabled={disabled}
            placeholder="0801 234 5678" onChange={(e) => onChange(e.target.value)} />
        )}
        {q.type === 'NUMBER' && (
          <Input id={id} type="number" inputMode="decimal" value={text} disabled={disabled} placeholder="0"
            className="sm:max-w-xs" onChange={(e) => onChange(e.target.value)} />
        )}
        {q.type === 'DATE' && (
          <Input id={id} type="date" value={text} disabled={disabled} className="sm:max-w-xs"
            onChange={(e) => onChange(e.target.value)} />
        )}
        {q.type === 'DROPDOWN' && (
          <select
            id={id}
            value={text}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm"
          >
            <option value="">Choose</option>
            {(q.options ?? []).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        )}
        {(q.type === 'MULTIPLE_CHOICE' || q.type === 'CHECKBOXES') && (
          <div className="space-y-1">
            {(q.options ?? []).map((o) => {
              const multiple = q.type === 'CHECKBOXES';
              const checked = multiple ? list.includes(o) : text === o;
              return (
                <label
                  key={o}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-muted/60',
                    disabled && 'cursor-default'
                  )}
                >
                  <input
                    type={multiple ? 'checkbox' : 'radio'}
                    name={id}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => {
                      if (!multiple) return onChange(o);
                      onChange(checked ? list.filter((v) => v !== o) : [...list, o]);
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                  />
                  <span className="min-w-0 break-words">{o}</span>
                </label>
              );
            })}
            {q.type === 'MULTIPLE_CHOICE' && text && !q.required && !disabled && (
              <button type="button" onClick={() => onChange('')} className="px-2 text-xs text-muted-foreground hover:text-foreground">
                Clear selection
              </button>
            )}
          </div>
        )}
        {q.type === 'SCALE' && <Scale q={q} value={text} disabled={disabled} onChange={onChange} />}
      </div>

      {error && <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </fieldset>
  );
}

function hasSingleInput(q: FormQuestion) {
  return !['MULTIPLE_CHOICE', 'CHECKBOXES', 'SCALE'].includes(q.type);
}

function Scale({ q, value, disabled, onChange }: { q: FormQuestion; value: string; disabled?: boolean; onChange: (v: Answer) => void }) {
  const min = q.scaleMin ?? 1;
  const max = q.scaleMax ?? 5;
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      {/* Wraps onto a second line on a narrow phone rather than overflowing. */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.label}>
        {steps.map((n) => {
          const selected = value === String(n);
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(n)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold tabular-nums transition-colors',
                selected
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-border bg-background hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/15'
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(q.scaleMinLabel || q.scaleMaxLabel) && (
        <div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground">
          <span>{q.scaleMinLabel && `${min}: ${q.scaleMinLabel}`}</span>
          <span className="text-right">{q.scaleMaxLabel && `${max}: ${q.scaleMaxLabel}`}</span>
        </div>
      )}
    </div>
  );
}
