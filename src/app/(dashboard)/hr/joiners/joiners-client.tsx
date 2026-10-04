'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardList, FileText, Inbox, Loader2, UserCheck, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoginDetailsDialog } from '@/components/hr/login-details-dialog';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import {
  approveOnboarding, rejectOnboarding, getOnboardingRequests,
  type OnboardingRequest, type ApprovalItem,
} from '@/actions/onboarding.actions';
import type { IssuedLogin } from '@/actions/auth.actions';

type Options = {
  departments: { id: string; name: string }[];
  roles: { id: string; name: string; level: number }[];
  branches: { id: string; name: string }[];
};

/** What HR has set or corrected on one request before approving it. */
type Draft = {
  firstName: string; middleName: string; lastName: string; email: string; phone: string;
  departmentId: string; roleId: string; branchId: string;
};

const draftFrom = (r: OnboardingRequest): Draft => ({
  firstName: r.details.firstName,
  middleName: r.details.middleName ?? '',
  lastName: r.details.lastName,
  email: r.details.email,
  phone: r.details.phone ?? '',
  departmentId: '',
  roleId: '',
  branchId: '',
});

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function JoinersClient({ userId, initialRequests, options }: {
  userId: string; initialRequests: OnboardingRequest[]; options: Options;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [requests, setRequests] = useState(initialRequests);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(initialRequests.map((r) => [r.id, draftFrom(r)])));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({ departmentId: '', roleId: '', branchId: '' });
  const [sendEmails, setSendEmails] = useState(true);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedLogin[] | null>(null);

  const load = async (status: typeof tab) => {
    setTab(status);
    setLoading(true);
    setSelected(new Set());
    try {
      const rows = await getOnboardingRequests(status);
      setRequests(rows);
      if (status === 'PENDING') {
        // Keep anything HR already typed on requests still waiting.
        setDrafts((d) => Object.fromEntries(rows.map((r) => [r.id, d[r.id] ?? draftFrom(r)])));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load requests');
    } finally {
      setLoading(false);
    }
  };

  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pending = tab === 'PENDING';
  const allSelected = pending && requests.length > 0 && selected.size === requests.length;

  const applyBulk = () => {
    if (!selected.size) return toast.error('Tick the requests to apply this to');
    setDrafts((d) => {
      const next = { ...d };
      for (const id of selected) {
        next[id] = {
          ...next[id],
          ...(bulk.departmentId ? { departmentId: bulk.departmentId } : {}),
          ...(bulk.roleId ? { roleId: bulk.roleId } : {}),
          ...(bulk.branchId ? { branchId: bulk.branchId } : {}),
        };
      }
      return next;
    });
    toast.success(`Applied to ${selected.size} request${selected.size === 1 ? '' : 's'}`);
  };

  const approve = async (ids: string[]) => {
    const missing = ids.filter((id) => !drafts[id]?.departmentId || !drafts[id]?.roleId);
    if (missing.length) {
      const names = missing.map((id) => { const d = drafts[id]; return `${d.firstName} ${d.lastName}`; });
      return toast.error(`Set a department and role for: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '...' : ''}`);
    }
    const byId = new Map(requests.map((r) => [r.id, r]));
    const items: ApprovalItem[] = ids.map((id) => {
      const d = drafts[id];
      const original = byId.get(id)!.details;
      return {
        responseId: id,
        details: {
          firstName: d.firstName, middleName: d.middleName || undefined, lastName: d.lastName,
          email: d.email, phone: d.phone || undefined,
          dateOfBirth: original.dateOfBirth, gender: original.gender, address: original.address, nationalId: original.nationalId,
        },
        departmentId: d.departmentId,
        roleId: d.roleId,
        branchId: d.branchId || undefined,
      };
    });

    setBusy(true);
    const result = await approveOnboarding(items, { sendEmails });
    setBusy(false);
    if (!result.success || !result.data) return toast.error(result.error ?? 'Approval failed');

    const { created, failed } = result.data;
    if (created.length) {
      toast.success(result.message);
      setIssued(created);
      const unsent = created.filter((c) => !c.emailed).length;
      if (sendEmails && unsent) toast.info(`${unsent} login email(s) could not be sent. Copy the details from the list.`, { duration: 10000 });
    }
    for (const f of failed) toast.error(`${f.name}: ${f.error}`, { duration: 10000 });

    const done = new Set(created.map((c) => c.responseId));
    setRequests((rs) => rs.filter((r) => !done.has(r.id)));
    setSelected((s) => new Set([...s].filter((id) => !done.has(id))));
    router.refresh();
  };

  const reject = async (ids: string[]) => {
    const note = window.prompt(`Reject ${ids.length} request${ids.length === 1 ? '' : 's'}? Add a note for the record (optional):`);
    if (note === null) return;
    setBusy(true);
    const result = await rejectOnboarding(ids, note);
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    const gone = new Set(ids);
    setRequests((rs) => rs.filter((r) => !gone.has(r.id)));
    setSelected(new Set());
  };

  const selectedIds = useMemo(() => requests.filter((r) => selected.has(r.id)).map((r) => r.id), [requests, selected]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-2">
          <Link href="/hr/staff" className="mt-0.5 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to People">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New joiners</h1>
            <p className="text-muted-foreground">
              New joiners&apos; details from the onboarding form. Set their department and role, then approve to create their accounts.
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href="/forms"><ClipboardList className="mr-2 h-4 w-4" />Onboarding form</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => load(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="PENDING">Waiting{pending && !loading ? ` (${requests.length})` : ''}</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {pending && requests.length > 0 && (
        <Card className="sticky top-2 z-20 border-indigo-200 shadow-md dark:border-indigo-500/30">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(requests.map((r) => r.id)))}
                />
                {selected.size ? `${selected.size} selected` : 'Select all'}
              </label>
              <label className="flex items-center gap-2 text-sm">
                Email login details
                <Switch checked={sendEmails} onCheckedChange={setSendEmails} />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <select className={selectClass} value={bulk.departmentId} onChange={(e) => setBulk({ ...bulk, departmentId: e.target.value })} aria-label="Department for selected">
                <option value="">Department...</option>
                {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select className={selectClass} value={bulk.roleId} onChange={(e) => setBulk({ ...bulk, roleId: e.target.value })} aria-label="Role for selected">
                <option value="">Role...</option>
                {options.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select className={selectClass} value={bulk.branchId} onChange={(e) => setBulk({ ...bulk, branchId: e.target.value })} aria-label="Branch for selected">
                <option value="">Branch (head office)...</option>
                {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <Button variant="secondary" size="sm" className="h-9" onClick={applyBulk}>Apply to selected</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="success" size="sm" disabled={busy || !selectedIds.length} onClick={() => approve(selectedIds)}>
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserCheck className="mr-1.5 h-3.5 w-3.5" />}
                Approve selected{selectedIds.length ? ` (${selectedIds.length})` : ''}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy || !selectedIds.length} onClick={() => reject(selectedIds)} className="hover:text-rose-600">
                <X className="mr-1.5 h-3.5 w-3.5" />Reject selected
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 font-medium">{pending ? 'No one is waiting' : tab === 'APPROVED' ? 'Nothing approved yet' : 'Nothing rejected'}</p>
            {pending && (
              <p className="mt-1 text-sm text-muted-foreground">
                Share the staff onboarding form link with new joiners. Create it under Forms, then New onboarding form.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((r) =>
            pending ? (
              <PendingCard
                key={r.id}
                request={r}
                draft={drafts[r.id] ?? draftFrom(r)}
                options={options}
                checked={selected.has(r.id)}
                onToggle={() => toggle(r.id)}
                onChange={(patch) => setDraft(r.id, patch)}
                onApprove={() => approve([r.id])}
                onReject={() => reject([r.id])}
                busy={busy}
              />
            ) : (
              <DecidedCard key={r.id} request={r} approved={tab === 'APPROVED'} />
            )
          )}
        </div>
      )}

      <LoginDetailsDialog
        open={issued !== null}
        onOpenChange={(open) => { if (!open) setIssued(null); }}
        results={issued}
        currentUserId={userId}
      />
    </div>
  );
}

function PendingCard({ request: r, draft: d, options, checked, onToggle, onChange, onApprove, onReject, busy }: {
  request: OnboardingRequest; draft: Draft; options: Options; checked: boolean;
  onToggle: () => void; onChange: (patch: Partial<Draft>) => void; onApprove: () => void; onReject: () => void; busy: boolean;
}) {
  const ready = !!d.departmentId && !!d.roleId;
  return (
    <Card className={cn(checked && 'ring-2 ring-indigo-500')}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" checked={checked} onChange={onToggle} aria-label={`Select ${d.firstName} ${d.lastName}`} />
          <div className="min-w-0 flex-1">
            <p className="break-words text-lg font-semibold">{[d.firstName, d.middleName, d.lastName].filter(Boolean).join(' ') || 'No name given'}</p>
            <p className="text-xs text-muted-foreground">Submitted {formatDateTime(r.submittedAt)} · {r.formTitle}</p>
          </div>
          {ready ? <Badge variant="success">Ready</Badge> : <Badge variant="secondary">Needs role</Badge>}
        </div>

        {r.emailTaken && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {d.email} already belongs to a staff account. Correct the email, or reject this request if it is a repeat.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First name"><Input className="h-9" value={d.firstName} onChange={(e) => onChange({ firstName: e.target.value })} /></Field>
          <Field label="Middle name"><Input className="h-9" value={d.middleName} onChange={(e) => onChange({ middleName: e.target.value })} /></Field>
          <Field label="Last name"><Input className="h-9" value={d.lastName} onChange={(e) => onChange({ lastName: e.target.value })} /></Field>
          <Field label="Email"><Input className="h-9" type="email" value={d.email} onChange={(e) => onChange({ email: e.target.value })} /></Field>
          <Field label="Phone"><Input className="h-9" value={d.phone} onChange={(e) => onChange({ phone: e.target.value })} /></Field>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-4">
          <Detail label="Date of birth" value={r.details.dateOfBirth ? formatDate(r.details.dateOfBirth) : null} />
          <Detail label="Gender" value={r.details.gender ? r.details.gender[0] + r.details.gender.slice(1).toLowerCase() : null} />
          <Detail label="NIN" value={r.details.nationalId ?? null} />
          <Detail label="Address" value={r.details.address ?? null} wide />
          {r.extras.map((x) => (
            <div key={x.label} className="col-span-2">
              <dt className="text-[11px] text-muted-foreground">{x.label}</dt>
              <dd className="break-words">
                {x.files.length
                  ? x.files.map((f) => (
                      <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="mr-3 inline-flex items-center gap-1 text-indigo-700 hover:underline dark:text-indigo-300">
                        <FileText className="h-3.5 w-3.5" />{f.name}
                      </a>
                    ))
                  : x.text}
              </dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3">
          <Field label="Department *">
            <select className={selectClass} value={d.departmentId} onChange={(e) => onChange({ departmentId: e.target.value })}>
              <option value="">Choose...</option>
              {options.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Role *">
            <select className={selectClass} value={d.roleId} onChange={(e) => onChange({ roleId: e.target.value })}>
              <option value="">Choose...</option>
              {options.roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Branch">
            <select className={selectClass} value={d.branchId} onChange={(e) => onChange({ branchId: e.target.value })}>
              <option value="">Head office</option>
              {options.branches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onReject} className="hover:text-rose-600">
            <X className="mr-1.5 h-3.5 w-3.5" />Reject
          </Button>
          <Button variant="success" size="sm" disabled={busy || !ready} onClick={onApprove}>
            <Check className="mr-1.5 h-3.5 w-3.5" />Approve and create account
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DecidedCard({ request: r, approved }: { request: OnboardingRequest; approved: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        {approved ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" /> : <X className="h-5 w-5 shrink-0 text-rose-500" />}
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium">{r.details.firstName} {r.details.lastName}</p>
          <p className="break-all text-xs text-muted-foreground">{r.details.email}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {approved && r.staff && <p className="font-mono text-foreground">{r.staff.employeeId}</p>}
          <p>{approved ? 'Approved' : 'Rejected'}{r.reviewedBy ? ` by ${r.reviewedBy}` : ''}</p>
          {r.reviewedAt && <p>{formatDateTime(r.reviewedAt)}</p>}
          {!approved && r.reviewNote && <p className="mt-1 max-w-xs italic">&ldquo;{r.reviewNote}&rdquo;</p>}
        </div>
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

function Detail({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="break-words">{value || <span className="text-muted-foreground">-</span>}</dd>
    </div>
  );
}
