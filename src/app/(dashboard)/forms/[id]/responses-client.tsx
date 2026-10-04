'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Pencil, Link2, Download, Play, Square, ChevronLeft, ChevronRight, Trash2, Inbox, Eye, User,
  FileText, ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/utils';
import {
  answerText, responsesCsv, summarize, isFileAnswer, formatFileSize, QUESTION_TYPE_LABEL,
  type Answer, type FileAnswer, type FormQuestion, type QuestionSummary,
} from '@/lib/forms';
import { setFormStatus, deleteFormResponse, type getFormResponses } from '@/actions/form.actions';
import { StatusBadge, AudienceBadge, copyShareLink, useShareUrl } from '../form-bits';
import { ShareFormButton } from '../share-form-button';
import { FormQrButton } from '../form-qr-button';

type FormData = NonNullable<Awaited<ReturnType<typeof getFormResponses>>>;

export function ResponsesClient({ form }: { form: FormData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState('summary');
  const link = useShareUrl(form.slug);
  const count = form.responses.length;
  const current = form.responses[Math.min(index, count - 1)];

  const summaries = useMemo(
    () => form.questions.map((q) => ({ q, s: summarize(q, form.responses.map((r) => r.answers)) })),
    [form]
  );

  const changeStatus = async (status: 'OPEN' | 'CLOSED') => {
    setBusy(true);
    const result = await setFormStatus(form.id, status);
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    router.refresh();
  };

  const removeResponse = async (id: string) => {
    if (!window.confirm('Delete this response? This cannot be undone.')) return;
    const result = await deleteFormResponse(id);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    setIndex((i) => Math.max(0, Math.min(i, count - 2)));
    router.refresh();
  };

  const exportCsv = () => {
    const csv = responsesCsv(form.questions, form.responses);
    // A BOM so Excel reads the file as UTF-8 (names with accents, ₦).
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.slug}-responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Link href="/forms" className="mt-0.5 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="All forms">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold tracking-tight">{form.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={form.status} accepting={form.accepting} />
              <AudienceBadge audience={form.audience} />
              {form.closesAt && <span className="text-xs text-muted-foreground">Closes {formatDateTime(form.closesAt)}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href={`/forms/${form.id}/edit`}><Pencil className="mr-2 h-4 w-4" />Edit</Link>
          </Button>
          <Button variant="secondary" asChild>
            <a href={`/f/${form.slug}`} target="_blank" rel="noreferrer"><Eye className="mr-2 h-4 w-4" />View</a>
          </Button>
          {form.status === 'OPEN' ? (
            <Button variant="secondary" disabled={busy} onClick={() => changeStatus('CLOSED')}>
              <Square className="mr-2 h-4 w-4" />Close
            </Button>
          ) : (
            <Button variant="success" disabled={busy} onClick={() => changeStatus('OPEN')}>
              <Play className="mr-2 h-4 w-4" />{form.status === 'DRAFT' ? 'Open form' : 'Reopen'}
            </Button>
          )}
          <Button variant="outline" disabled={count === 0} onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />Export CSV
          </Button>
        </div>
      </div>

      {form.purpose === 'STAFF_ONBOARDING' && (
        <p className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
          Staff onboarding form.{' '}
          <span className="font-semibold">{form.responses.filter((x) => x.onboardingStatus === 'PENDING').length}</span> waiting for HR.{' '}
          <Link href="/hr/joiners" className="font-medium underline">Review and create accounts</Link>
        </p>
      )}

      {form.status !== 'DRAFT' ? (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <span className="shrink-0 text-sm font-medium">Share link</span>
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => copyShareLink(form.slug)}>
                <Link2 className="mr-2 h-4 w-4" />Copy
              </Button>
              <ShareFormButton slug={form.slug} title={form.title} variant="full" />
              <FormQrButton slug={form.slug} title={form.title} variant="full" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          This form is a draft. Open it to get a share link{form.audience === 'STAFF' ? ' and notify every staff member' : ''}.
        </p>
      )}

      {count === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 font-medium">No responses yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Responses appear here as soon as people submit the form.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="individual">Individual</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{count.toLocaleString()}</span> response{count === 1 ? '' : 's'}
              {form.responses[0] && <> · latest {formatDateTime(form.responses[0].submittedAt)}</>}
            </p>
            {summaries.map(({ q, s }) => (
              <SummaryCard key={q.id} question={q} summary={s} total={count} />
            ))}
          </TabsContent>

          <TabsContent value="individual">
            {current && (
              <Card>
                <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} aria-label="Previous response">
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <span className="min-w-20 text-center text-sm tabular-nums">{index + 1} of {count}</span>
                    <Button size="icon" variant="ghost" disabled={index >= count - 1} onClick={() => setIndex((i) => i + 1)} aria-label="Next response">
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="min-w-0 text-sm">
                      <p className="flex items-center gap-1.5 font-medium"><User className="h-4 w-4 text-muted-foreground" />{current.respondent ?? 'Anonymous'}</p>
                      <p className="text-xs text-muted-foreground">
                        {[current.respondentDetail, formatDateTime(current.submittedAt)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="hover:text-rose-600" onClick={() => removeResponse(current.id)} aria-label="Delete response">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="divide-y p-0">
                  {form.questions.map((q) => {
                    const value = current.answers[q.id];
                    const text = answerText(value);
                    return (
                      <div key={q.id} className="px-5 py-4">
                        <p className="text-sm font-medium">{q.label}</p>
                        {isFileAnswer(value) ? (
                          <FileList files={value} className="mt-2" />
                        ) : (
                          <p className={text ? 'mt-1 whitespace-pre-line break-words' : 'mt-1 text-sm italic text-muted-foreground'}>
                            {text || 'No answer'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="table">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Submitted</th>
                      <th className="px-4 py-3 font-medium">Respondent</th>
                      {form.questions.map((q) => (
                        <th key={q.id} className="max-w-64 px-4 py-3 font-medium">{q.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {form.responses.map((r, i) => (
                      <tr key={r.id} className="cursor-pointer hover:bg-muted/40"
                        onClick={() => {
                          setIndex(i);
                          setTab('individual');
                        }}>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(r.submittedAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{r.respondent ?? 'Anonymous'}</td>
                        {form.questions.map((q) => (
                          <td key={q.id} className="max-w-64 truncate px-4 py-3" title={answerText(r.answers[q.id])}>
                            <Cell value={r.answers[q.id]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function SummaryCard({ question: q, summary: s, total }: { question: FormQuestion; summary: QuestionSummary; total: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="break-words text-base">{q.label}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {QUESTION_TYPE_LABEL[q.type]} · {s.answered.toLocaleString()} of {total.toLocaleString()} answered
        </p>
      </CardHeader>
      <CardContent>
        {(s.kind === 'choices' || s.kind === 'scale') && (
          <>
            {s.kind === 'scale' && s.average != null && (
              <p className="mb-3 text-sm">
                Average <span className="text-lg font-semibold tabular-nums">{s.average.toFixed(1)}</span>
                <span className="text-muted-foreground"> / {q.scaleMax}</span>
              </p>
            )}
            <Bars counts={s.counts} denominator={s.answered} />
            {q.type === 'CHECKBOXES' && <p className="mt-2 text-xs text-muted-foreground">People could pick more than one, so shares can add up past 100%.</p>}
          </>
        )}
        {s.kind === 'number' && (
          <div className="grid grid-cols-3 gap-3">
            {[['Average', s.average], ['Lowest', s.min], ['Highest', s.max]].map(([label, value]) => (
              <div key={label as string} className="rounded-lg bg-muted/60 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {value == null ? '–' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        )}
        {s.kind === 'files' && (
          s.latest.length ? (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{s.fileCount.toLocaleString()}</span> file{s.fileCount === 1 ? '' : 's'} uploaded
              </p>
              <FileList files={s.latest} />
              {s.fileCount > s.latest.length && (
                <p className="mt-2 text-xs text-muted-foreground">Showing the latest {s.latest.length}. See Individual or Table for the rest.</p>
              )}
            </>
          ) : (
            <p className="text-sm italic text-muted-foreground">No files yet</p>
          )
        )}
        {s.kind === 'text' && (
          s.latest.length ? (
            <ul className="space-y-2">
              {s.latest.map((t, i) => (
                <li key={i} className="whitespace-pre-line break-words rounded-lg bg-muted/60 px-3 py-2 text-sm">{t}</li>
              ))}
              {s.answered > s.latest.length && (
                <li className="text-xs text-muted-foreground">
                  Showing the latest {s.latest.length}. See Individual or Table for all {s.answered.toLocaleString()}.
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm italic text-muted-foreground">No answers yet</p>
          )
        )}
      </CardContent>
    </Card>
  );
}

/** Horizontal bars: one hue, the count and share in text ink beside each. */
function Bars({ counts, denominator }: { counts: { option: string; count: number }[]; denominator: number }) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <ul className="space-y-2.5">
      {counts.map((c) => {
        const share = denominator ? Math.round((c.count / denominator) * 100) : 0;
        return (
          <li key={c.option} title={`${c.option}: ${c.count} (${share}%)`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 break-words">{c.option}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{c.count}</span> · {share}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(c.count / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Uploaded files as links that open in a new tab. */
function FileList({ files, className }: { files: FileAnswer[]; className?: string }) {
  return (
    <ul className={`space-y-1.5 ${className ?? ''}`}>
      {files.map((f) => (
        <li key={f.url}>
          <a
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm hover:bg-muted"
          >
            {f.type.startsWith('image/') ? (
              <ImageIcon className="h-4 w-4 shrink-0 text-indigo-500" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-indigo-500" />
            )}
            <span className="min-w-0 flex-1 truncate text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300">{f.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatFileSize(f.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** A table cell: file links stay clickable without opening the row. */
function Cell({ value }: { value: Answer | undefined }) {
  if (!isFileAnswer(value)) return <>{answerText(value)}</>;
  return (
    <span className="flex gap-2">
      {value.map((f) => (
        <a
          key={f.url}
          href={f.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="truncate text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
        >
          {f.name}
        </a>
      ))}
    </span>
  );
}
