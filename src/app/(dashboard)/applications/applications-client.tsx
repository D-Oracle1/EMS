'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronDown, ClipboardList, FileText, Inbox, Link2, Loader2,
  ShieldCheck, Unlink, UserCheck, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { PURPOSE_INFO, GUARANTORS_REQUIRED, type CustomerPurpose } from '@/lib/customer-forms';
import {
  approveApplication, rejectApplication, attachGuarantor, detachGuarantor, getApplications, getUnlinkedGuarantors,
  type Application, type GuarantorEntry,
} from '@/actions/application.actions';
import type { FileAnswer } from '@/lib/forms';
import { FeePanel } from './fee-panel';

type Kind = Exclude<CustomerPurpose, 'GUARANTOR'>;
type Status = 'PENDING' | 'APPROVED' | 'REJECTED';
type Unlinked = Awaited<ReturnType<typeof getUnlinkedGuarantors>>[number];
type Answered = { label: string; text: string; files: FileAnswer[] };

/** What the officer has corrected on one application, and how they will profile it. */
type Draft = {
  firstName: string; middleName: string; lastName: string; phone: string; email: string; address: string;
  /** An existing customer to link to, or '' to profile a new one. */
  linkTo: string;
  branchId: string;
};

const draftFrom = (a: Application): Draft => ({
  firstName: a.details.firstName,
  middleName: a.details.middleName ?? '',
  lastName: a.details.lastName,
  phone: a.details.phone,
  email: a.details.email ?? '',
  address: a.details.address,
  // Suggest linking when exactly one customer shares the phone or email.
  linkTo: a.matches.length === 1 ? a.matches[0].id : '',
  branchId: '',
});

const NEXT_LABEL: Record<Kind, string> = {
  SAVINGS_APPLICATION: 'Approve and open savings',
  PARTNERSHIP_APPLICATION: 'Approve and open partnership',
  FIXED_DEPOSIT_APPLICATION: 'Approve and open fixed deposit',
  LOAN_APPLICATION: 'Approve and create loan',
};

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ApplicationsClient({ kinds, kind, initialApplications, counts, branches, initialUnlinked, canManageForms, canDiscount }: {
  kinds: Kind[];
  kind: Kind;
  initialApplications: Application[];
  counts: Partial<Record<Kind, number>>;
  branches: { id: string; name: string }[];
  initialUnlinked: Unlinked[];
  canManageForms: boolean;
  /** Managers and admins: discount fees and reverse payments. */
  canDiscount: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('PENDING');
  const [applications, setApplications] = useState(initialApplications);
  const [unlinked, setUnlinked] = useState(initialUnlinked);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(initialApplications.map((a) => [a.id, draftFrom(a)])));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loans = kind === 'LOAN_APPLICATION';
  const pending = status === 'PENDING';

  const reload = async (next: Status = status) => {
    setLoading(true);
    try {
      const [rows, loose] = await Promise.all([getApplications(kind, next), loans ? getUnlinkedGuarantors() : Promise.resolve([])]);
      setApplications(rows);
      setUnlinked(loose);
      setDrafts((d) => Object.fromEntries(rows.map((a) => [a.id, d[a.id] ?? draftFrom(a)])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load applications');
    } finally {
      setLoading(false);
    }
  };

  const switchStatus = (next: Status) => {
    setStatus(next);
    reload(next);
  };

  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const approve = async (a: Application) => {
    const d = drafts[a.id];
    if (loans) {
      const have = a.guarantors.filter((g) => g.status !== 'REJECTED').length;
      if (have < GUARANTORS_REQUIRED && !window.confirm(
        `${d.firstName} has ${have} of ${GUARANTORS_REQUIRED} guarantors. Approve anyway? You can add the rest on the loan screen.`
      )) return;
    }
    if (!d.linkTo && branches.length && !a.formBranchId && !d.branchId) return toast.error('Choose the branch this customer belongs to');
    if (a.fee && a.fee.balance > 0 && !window.confirm(
      `${formatCurrency(a.fee.balance)} of the fee is still owed.${loans ? ' The loan cannot be created until it is paid.' : ''} Approve anyway?`
    )) return;

    setBusy(a.id);
    const result = await approveApplication({
      responseId: a.id,
      details: { firstName: d.firstName, middleName: d.middleName, lastName: d.lastName, phone: d.phone, email: d.email, address: d.address },
      existingCustomerId: d.linkTo || undefined,
      branchId: d.branchId || undefined,
    });
    setBusy(null);
    if (!result.success || !result.data) return toast.error(result.error ?? 'Approval failed');
    toast.success(result.message);
    router.push(result.data.nextUrl);
  };

  const reject = async (id: string, what: string) => {
    const note = window.prompt(`Reject ${what}? Add a note for the record (optional):`);
    if (note === null) return;
    setBusy(id);
    const result = await rejectApplication(id, note);
    setBusy(null);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    reload();
    router.refresh();
  };

  const attach = async (guarantorId: string, applicationId: string) => {
    if (!applicationId) return toast.error('Choose the application to attach to');
    setBusy(guarantorId);
    const result = await attachGuarantor(guarantorId, applicationId);
    setBusy(null);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    reload();
  };

  const detach = async (guarantorId: string) => {
    setBusy(guarantorId);
    const result = await detachGuarantor(guarantorId);
    setBusy(null);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    reload();
  };

  const info = PURPOSE_INFO[kind];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
          <p className="text-muted-foreground">
            Forms filled from a link by people not yet profiled. Check the details, then approve to profile the customer and open their account.
          </p>
        </div>
        {canManageForms && (
          <Button variant="outline" asChild>
            <Link href="/forms"><ClipboardList className="mr-2 h-4 w-4" />Application forms</Link>
          </Button>
        )}
      </div>

      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <Link
              key={k}
              href={`/applications?kind=${k}`}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                k === kind ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-card hover:bg-muted'
              )}
            >
              {PURPOSE_INFO[k].label}
              {!!counts[k] && (
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', k === kind ? 'bg-white/25' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200')}>
                  {counts[k]}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      <Tabs value={status} onValueChange={(v) => switchStatus(v as Status)}>
        <TabsList>
          <TabsTrigger value="PENDING">Waiting{pending && !loading ? ` (${applications.length})` : ''}</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {loans && pending && unlinked.length > 0 && (
        <UnlinkedGuarantors
          guarantors={unlinked}
          applications={applications}
          busy={busy}
          onAttach={attach}
          onReject={(g) => reject(g.id, `${g.details.firstName} ${g.details.lastName}'s guarantor form`)}
          canDiscount={canDiscount}
          onChanged={() => reload()}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : applications.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 font-medium">
              {pending ? `No ${info.label.toLowerCase()} applications waiting` : status === 'APPROVED' ? 'Nothing approved yet' : 'Nothing rejected'}
            </p>
            {pending && (
              <p className="mt-1 text-sm text-muted-foreground">
                Share the {info.title.toLowerCase()} link with customers.{canManageForms ? ' Create it under Forms, then Customer form.' : ''}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {applications.map((a) =>
            pending ? (
              <PendingCard
                key={a.id}
                kind={kind}
                application={a}
                draft={drafts[a.id] ?? draftFrom(a)}
                branches={branches}
                busy={busy}
                onChange={(patch) => setDraft(a.id, patch)}
                onApprove={() => approve(a)}
                onReject={() => reject(a.id, `${a.details.firstName} ${a.details.lastName}'s application`)}
                onRejectGuarantor={(g) => reject(g.id, `${g.details.firstName} ${g.details.lastName} as guarantor`)}
                onDetachGuarantor={(g) => detach(g.id)}
                canDiscount={canDiscount}
                onChanged={() => reload()}
              />
            ) : (
              <DecidedCard
                key={a.id}
                kind={kind}
                application={a}
                approved={status === 'APPROVED'}
                canDiscount={canDiscount}
                onChanged={() => reload()}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function PendingCard({
  kind, application: a, draft: d, branches, busy, onChange, onApprove, onReject, onRejectGuarantor, onDetachGuarantor,
  canDiscount, onChanged,
}: {
  kind: Kind; application: Application; draft: Draft; branches: { id: string; name: string }[]; busy: string | null;
  onChange: (patch: Partial<Draft>) => void; onApprove: () => void; onReject: () => void;
  onRejectGuarantor: (g: GuarantorEntry) => void; onDetachGuarantor: (g: GuarantorEntry) => void;
  canDiscount: boolean; onChanged: () => void;
}) {
  const linking = !!d.linkTo;
  const needsBranch = !linking && branches.length > 0 && !a.formBranchId;
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-lg font-semibold">{[d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') || 'No name given'}</p>
            <p className="text-xs text-muted-foreground">
              Submitted {formatDateTime(a.submittedAt)} · {a.formTitle}{a.branch ? ` · ${a.branch}` : ''}
            </p>
            {a.referredBy && <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Referred by {a.referredBy}</p>}
          </div>
          {a.reference && <Badge variant="outline" className="font-mono">{a.reference}</Badge>}
        </div>

        <Terms kind={kind} terms={a.terms} />

        {a.fee && <FeePanel responseId={a.id} fee={a.fee} canDiscount={canDiscount} onChanged={onChanged} />}

        {a.matches.length > 0 && (
          <div className="space-y-2 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="flex items-start gap-2 font-medium">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {a.matches.length === 1 ? 'This may already be a customer:' : 'These customers share the phone number or email:'}
            </p>
            <div className="space-y-1.5 pl-6">
              {a.matches.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2">
                  <input type="radio" className="accent-indigo-600" checked={d.linkTo === m.id} onChange={() => onChange({ linkTo: m.id })} />
                  <span>
                    Link to <span className="font-mono">{m.customerNumber}</span> {m.name} ({m.phone})
                    {m.status !== 'ACTIVE' && <span className="ml-1 text-rose-700 dark:text-rose-300">{m.status.toLowerCase()}</span>}
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" className="accent-indigo-600" checked={!d.linkTo} onChange={() => onChange({ linkTo: '' })} />
                <span>A different person: profile as a new customer</span>
              </label>
            </div>
          </div>
        )}

        {!linking && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="First name"><Input className="h-9" value={d.firstName} onChange={(e) => onChange({ firstName: e.target.value })} /></Field>
            <Field label="Middle name"><Input className="h-9" value={d.middleName} onChange={(e) => onChange({ middleName: e.target.value })} /></Field>
            <Field label="Surname"><Input className="h-9" value={d.lastName} onChange={(e) => onChange({ lastName: e.target.value })} /></Field>
            <Field label="Phone"><Input className="h-9" value={d.phone} onChange={(e) => onChange({ phone: e.target.value })} /></Field>
            <Field label="Email"><Input className="h-9" type="email" value={d.email} onChange={(e) => onChange({ email: e.target.value })} /></Field>
            <Field label="Address"><Input className="h-9" value={d.address} onChange={(e) => onChange({ address: e.target.value })} /></Field>
          </div>
        )}

        <AnswerList answered={a.answered} />

        {kind === 'LOAN_APPLICATION' && (
          <Guarantors
            guarantors={a.guarantors}
            busy={busy}
            onReject={onRejectGuarantor}
            onDetach={onDetachGuarantor}
            canDiscount={canDiscount}
            onChanged={onChanged}
          />
        )}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
          {needsBranch ? (
            <Field label="Branch for this customer *">
              <select className={cn(selectClass, 'sm:w-64')} value={d.branchId} onChange={(e) => onChange({ branchId: e.target.value })}>
                <option value="">Choose...</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          ) : <span />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy === a.id} onClick={onReject} className="hover:text-rose-600">
              <X className="mr-1.5 h-3.5 w-3.5" />Reject
            </Button>
            <Button variant="success" size="sm" disabled={busy === a.id || (needsBranch && !d.branchId)} onClick={onApprove}>
              {busy === a.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserCheck className="mr-1.5 h-3.5 w-3.5" />}
              {NEXT_LABEL[kind]}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Terms({ kind, terms }: { kind: Kind; terms: Application['terms'] }) {
  const items: [string, string][] = [];
  if (terms.amount) items.push([kind === 'LOAN_APPLICATION' ? 'Loan requested' : 'Amount', formatCurrency(terms.amount)]);
  if (terms.plan) items.push(['Contract', terms.plan.label]);
  if (kind === 'SAVINGS_APPLICATION' && terms.durationText) items.push(['Duration', terms.durationText]);
  if (terms.tenureMonths) items.push(['Tenure', `${terms.tenureMonths} month${terms.tenureMonths === 1 ? '' : 's'}, repaid daily`]);
  if (terms.loanPurpose) items.push(['Purpose', terms.loanPurpose]);
  if (!items.length) return null;
  return (
    <dl className="flex flex-wrap gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-indigo-50 px-3 py-1.5 dark:bg-indigo-500/10">
          <dt className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">{label}</dt>
          <dd className="break-words text-sm font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AnswerList({ answered, title = 'All answers' }: { answered: Answered[]; title?: string }) {
  if (!answered.length) return null;
  return (
    <details className="group rounded-xl bg-muted/50">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
        {title} ({answered.length})
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 px-3 pb-3 text-sm sm:grid-cols-2">
        {answered.map((x, i) => (
          <div key={`${x.label}-${i}`} className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">{x.label}</dt>
            <dd className="break-words">
              {x.files.length
                ? x.files.map((f) => <FileLink key={f.url} file={f} />)
                : /^\d{4}-\d{2}-\d{2}$/.test(x.text) ? formatDate(x.text) : x.text}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function FileLink({ file }: { file: FileAnswer }) {
  const image = file.type.startsWith('image/');
  return (
    <a href={file.url} target="_blank" rel="noreferrer" className="mr-3 inline-flex items-center gap-1.5 text-indigo-700 hover:underline dark:text-indigo-300">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt={file.name} className="h-14 w-14 rounded-md border object-cover" />
      ) : (
        <><FileText className="h-3.5 w-3.5" />{file.name}</>
      )}
    </a>
  );
}

function Guarantors({ guarantors, busy, onReject, onDetach, canDiscount, onChanged }: {
  guarantors: GuarantorEntry[]; busy: string | null; onReject: (g: GuarantorEntry) => void; onDetach: (g: GuarantorEntry) => void;
  canDiscount: boolean; onChanged: () => void;
}) {
  const active = guarantors.filter((g) => g.status !== 'REJECTED');
  const complete = active.length >= GUARANTORS_REQUIRED;
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />Guarantors
        </p>
        <Badge variant={complete ? 'success' : 'warning'}>{active.length}/{GUARANTORS_REQUIRED}</Badge>
      </div>
      {active.length === 0 && (
        <p className="text-sm text-muted-foreground">
          None yet. The applicant was given a guarantor link with their application number.
        </p>
      )}
      {active.map((g) => (
        <div key={g.id} className="rounded-lg bg-muted/50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 text-sm">
              <p className="font-medium">{[g.details.firstName, g.details.middleName, g.details.lastName].filter(Boolean).join(' ')}</p>
              <p className="text-xs text-muted-foreground">
                {g.details.phone}{g.details.relationship ? ` · ${g.details.relationship}` : ''}{g.details.occupation ? ` · ${g.details.occupation}` : ''}
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={busy === g.id} onClick={() => onDetach(g)} title="Move back to unattached guarantors">
                <Unlink className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" disabled={busy === g.id} onClick={() => onReject(g)} className="hover:text-rose-600">
                <X className="mr-1 h-3.5 w-3.5" />Reject
              </Button>
            </div>
          </div>
          {g.fee && (
            <div className="mt-2"><FeePanel responseId={g.id} fee={g.fee} canDiscount={canDiscount} compact onChanged={onChanged} /></div>
          )}
          <div className="mt-2"><AnswerList answered={g.answered} title="Guarantor's answers" /></div>
        </div>
      ))}
      {!complete && (
        <p className="text-xs text-muted-foreground">
          Waiting for {GUARANTORS_REQUIRED - active.length} more. A rejected guarantor frees the place for someone else.
        </p>
      )}
    </div>
  );
}

function UnlinkedGuarantors({ guarantors, applications, busy, onAttach, onReject, canDiscount, onChanged }: {
  guarantors: Unlinked[]; applications: Application[]; busy: string | null;
  onAttach: (guarantorId: string, applicationId: string) => void; onReject: (g: Unlinked) => void;
  canDiscount: boolean; onChanged: () => void;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const open = applications.filter((a) => a.guarantors.filter((g) => g.status !== 'REJECTED').length < GUARANTORS_REQUIRED);
  return (
    <Card className="border-amber-300 dark:border-amber-500/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-amber-600" />Guarantor forms not attached to an application ({guarantors.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">These guarantors filled the form without the applicant&apos;s link. Attach each one to the right application.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {guarantors.map((g) => (
          <div key={g.id} className="space-y-2 rounded-lg bg-muted/50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
              <div>
                <p className="font-medium">{g.details.firstName} {g.details.lastName}</p>
                <p className="text-xs text-muted-foreground">
                  {g.details.phone}{g.details.relationship ? ` · ${g.details.relationship}` : ''} · {formatDateTime(g.submittedAt)}
                </p>
              </div>
              <Button variant="ghost" size="sm" disabled={busy === g.id} onClick={() => onReject(g)} className="hover:text-rose-600">
                <X className="mr-1 h-3.5 w-3.5" />Reject
              </Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                className={selectClass}
                value={choice[g.id] ?? ''}
                onChange={(e) => setChoice((c) => ({ ...c, [g.id]: e.target.value }))}
                aria-label="Application to attach to"
              >
                <option value="">Attach to application...</option>
                {open.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.reference} · {a.details.firstName} {a.details.lastName}{a.terms.amount ? ` · ${formatCurrency(a.terms.amount)}` : ''}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="secondary" className="h-9 shrink-0" disabled={busy === g.id || !choice[g.id]} onClick={() => onAttach(g.id, choice[g.id])}>
                <Check className="mr-1.5 h-3.5 w-3.5" />Attach
              </Button>
            </div>
            {g.fee && <FeePanel responseId={g.id} fee={g.fee} canDiscount={canDiscount} compact onChanged={onChanged} />}
            <AnswerList answered={g.answered} title="Guarantor's answers" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DecidedCard({ kind, application: a, approved, canDiscount, onChanged }: {
  kind: Kind; application: Application; approved: boolean; canDiscount: boolean; onChanged: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {approved ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> : <X className="h-5 w-5 shrink-0 text-rose-500" />}
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium">{a.details.firstName} {a.details.lastName}</p>
            <p className="text-xs text-muted-foreground">
              {a.reference && <span className="font-mono">{a.reference}</span>} · {a.details.phone}
              {a.terms.amount ? ` · ${formatCurrency(a.terms.amount)}` : ''}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{approved ? 'Approved' : 'Rejected'}{a.reviewedBy ? ` by ${a.reviewedBy}` : ''}</p>
            {a.reviewedAt && <p>{formatDateTime(a.reviewedAt)}</p>}
            {!approved && a.reviewNote && <p className="mt-1 max-w-xs italic">&ldquo;{a.reviewNote}&rdquo;</p>}
          </div>
        </div>
        {a.fee && <FeePanel responseId={a.id} fee={a.fee} canDiscount={canDiscount} readOnly={!approved} onChanged={onChanged} />}
        {approved && a.guarantors.filter((g) => g.fee && g.status !== 'REJECTED').map((g) => (
          <div key={g.id} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Guarantor: {g.details.firstName} {g.details.lastName}</p>
            <FeePanel responseId={g.id} fee={g.fee!} canDiscount={canDiscount} compact onChanged={onChanged} />
          </div>
        ))}
        {approved && a.customer && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button size="sm" variant="secondary" asChild>
              <Link href={`/customers/${a.customer.id}`}><UserCheck className="mr-1.5 h-3.5 w-3.5" />{a.customer.customerNumber}</Link>
            </Button>
            {a.nextUrl && !a.loanCreated && (
              <Button size="sm" variant="secondary" asChild>
                <Link href={a.nextUrl}>
                  {kind === 'LOAN_APPLICATION' ? 'Create the loan' : kind === 'FIXED_DEPOSIT_APPLICATION' ? 'Open the fixed deposit' : 'Open the savings account'}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
