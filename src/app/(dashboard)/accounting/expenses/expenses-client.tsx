'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  Banknote, Plus, Clock, CheckCircle2, XCircle, Loader2, Search,
  ChevronLeft, ChevronRight, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { monthKey } from '@/lib/marketing-access';
import {
  getExpenseOptions, getExpenses, getExpenseSummary, recordExpense, approveExpense, rejectExpense,
  type ExpenseRow, type ExpenseFilters,
} from '@/actions/expense.actions';

type Access = { canRecord: boolean; canApprove: boolean; userId: string };
type Options = Awaited<ReturnType<typeof getExpenseOptions>>;
type Summary = Awaited<ReturnType<typeof getExpenseSummary>>;

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error' | 'info'> = {
  PENDING: 'warning', APPROVING: 'info', APPROVED: 'success', REJECTED: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Awaiting approval', APPROVING: 'Being approved', APPROVED: 'Approved & posted', REJECTED: 'Rejected',
};
const PAYMENT_MODES = [
  ['CASH', 'Cash'], ['BANK_TRANSFER', 'Bank transfer'], ['CHEQUE', 'Cheque'], ['POS', 'POS'], ['MOBILE_MONEY', 'Mobile money'],
] as const;

function recentMonths() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: monthKey(d), label: d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) };
  });
}

export function ExpensesClient({ access }: { access: Access }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [recordOpen, setRecordOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const months = useMemo(() => recentMonths(), []);

  useEffect(() => {
    getExpenseOptions().then(setOptions).catch((e) => toast.error(e.message));
  }, []);
  useEffect(() => {
    getExpenseSummary(month).then(setSummary).catch((e) => toast.error(e.message));
  }, [month, refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Banknote className="h-6 w-6" />Expenses</h1>
          <p className="text-muted-foreground">
            {access.canApprove
              ? 'Approve the expenses the accountant records. Only approved expenses are posted to the books.'
              : 'Record what the company spends. Each expense is posted to the books once an admin approves it.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>{months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          {access.canRecord && (
            <Button onClick={() => setRecordOpen(true)} disabled={!options}><Plus className="mr-2 h-4 w-4" />Record expense</Button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Spent this month" color="sky" icon={Banknote}
            value={formatCurrency(summary.approvedAmount)}
            description={`${summary.approvedCount} approved expense${summary.approvedCount === 1 ? '' : 's'}`} />
          <StatCard title="Awaiting approval" color="amber" icon={Clock}
            value={summary.pendingCount} description={`${formatCurrency(summary.pendingAmount)} recorded`} />
          <StatCard title="Largest category" color="violet" icon={CheckCircle2}
            value={summary.byCategory[0] ? formatCurrency(summary.byCategory[0].amount) : '—'}
            description={summary.byCategory[0]?.label ?? 'Nothing approved yet'} />
          <StatCard title="Head office vs branches" color="slate" icon={Banknote}
            value={summary.byBranch.length}
            description={summary.byBranch.length ? `${summary.byBranch.length} place${summary.byBranch.length === 1 ? '' : 's'} with spend` : 'Nothing approved yet'} />
        </div>
      )}

      <Tabs defaultValue={access.canApprove ? 'pending' : 'all'} className="space-y-4">
        <TabsList>
          {access.canApprove && <TabsTrigger value="pending">To approve{summary?.pendingCount ? ` (${summary.pendingCount})` : ''}</TabsTrigger>}
          <TabsTrigger value="all">All expenses</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
        </TabsList>
        {access.canApprove && (
          <TabsContent value="pending">
            <ExpenseList key={`p-${refreshKey}`} fixed={{ status: 'PENDING' }} access={access} options={options} onChanged={refresh} reviewable />
          </TabsContent>
        )}
        <TabsContent value="all">
          <ExpenseList key={`a-${refreshKey}-${month}`} fixed={{ month }} access={access} options={options} onChanged={refresh} filters />
        </TabsContent>
        <TabsContent value="breakdown">
          {summary && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <BreakdownCard title="By category" rows={summary.byCategory} />
              <BreakdownCard title="By branch" rows={summary.byBranch} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {options && <RecordExpenseDialog open={recordOpen} onOpenChange={setRecordOpen} options={options} onRecorded={refresh} />}
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { label: string; amount: number; count: number }[] }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No approved expenses this month.</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="text-sm">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{total > 0 ? `${Math.round((r.amount / total) * 100)}%` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── List ────────────────────────────────────────────────────────────────────

function ExpenseList({ fixed, access, options, onChanged, reviewable = false, filters = false }: {
  fixed: ExpenseFilters;
  access: Access;
  options: Options | null;
  onChanged: () => void;
  reviewable?: boolean;
  filters?: boolean;
}) {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [branch, setBranch] = useState('');
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<ExpenseRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = (page = 1) =>
    startTransition(async () => {
      try {
        const r = await getExpenses({
          ...fixed,
          status: fixed.status ?? (status || undefined),
          expenseAccountId: category || undefined,
          branchId: branch || undefined,
          search: search || undefined,
          page,
        });
        setRows(r.data);
        setPagination(r.pagination);
      } catch (e: any) {
        toast.error(e.message || 'Could not load expenses');
      }
    });

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, branch]);

  return (
    <Card>
      {filters && (
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="relative w-full lg:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Reference, payee, description..." value={search}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} />
          </div>
          <Select value={status || 'ALL'} onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="PENDING">Awaiting approval</SelectItem>
              <SelectItem value="APPROVED">Approved & posted</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          {options && (
            <Select value={category || 'ALL'} onValueChange={(v) => setCategory(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {options.expenseAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.accountCode} · {a.accountName}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {options && (
            <Select value={branch || 'ALL'} onValueChange={(v) => setBranch(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All locations</SelectItem>
                <SelectItem value="HQ">Head office</SelectItem>
                {options.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={() => load(1)}><Search className="mr-2 h-4 w-4" />Search</Button>
        </CardHeader>
      )}
      <CardContent className={filters ? '' : 'pt-6'}>
        {isPending ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="mr-2 h-5 w-5 animate-spin" />Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expense</TableHead>
                  <TableHead>Category · Paid from</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {reviewable && <TableHead className="text-right">Review</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {reviewable ? 'Nothing waiting for approval.' : 'No expenses match.'}
                  </TableCell></TableRow>
                ) : rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{e.reference} · {formatDate(e.expenseDate)}</div>
                      <div className="text-sm font-medium">{e.payee}</div>
                      <div className="max-w-[260px] text-xs text-muted-foreground">{e.description}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{e.category}</div>
                      <div className="text-xs text-muted-foreground">{e.paidFrom} · {e.paymentMode.replace(/_/g, ' ').toLowerCase()}</div>
                    </TableCell>
                    <TableCell className="text-sm">{e.branch ?? 'Head office'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(e.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[e.status] ?? 'info'}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                      <div className="mt-1 text-xs text-muted-foreground">by {e.recordedBy}</div>
                      {e.status === 'REJECTED' && e.reviewNote && <div className="mt-1 max-w-[220px] text-xs text-muted-foreground">{e.reviewNote}</div>}
                    </TableCell>
                    {reviewable && (
                      <TableCell className="text-right">
                        {e.recordedById === access.userId
                          ? <span className="text-xs text-muted-foreground">You recorded this</span>
                          : <Button size="sm" onClick={() => setReviewing(e)}>Review</Button>}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {pagination.totalPages > 1 && !isPending && (
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <p className="text-sm text-muted-foreground">{pagination.total} expenses</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
              <span className="text-sm">Page {pagination.page} of {pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </CardContent>
      {reviewing && (
        <ReviewExpenseDialog key={reviewing.id} expense={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); onChanged(); }} />
      )}
    </Card>
  );
}

/** Mounted fresh for each expense (keyed by id), so its form starts clean. */
function ReviewExpenseDialog({ expense, onClose, onDone }: { expense: ExpenseRow; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'approve' | 'reject'>('approve');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const submit = () => startTransition(async () => {
    const r = mode === 'approve' ? await approveExpense(expense.id, note) : await rejectExpense(expense.id, note);
    if (r.success) { toast.success(r.message); onDone(); } else toast.error(r.error || 'Could not update the expense');
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review {expense.reference}</DialogTitle>
          <DialogDescription>Recorded by {expense.recordedBy}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Paid to</dt><dd>{expense.payee}</dd>
          <dt className="text-muted-foreground">For</dt><dd>{expense.description}</dd>
          <dt className="text-muted-foreground">Amount</dt><dd className="tabular-nums">{formatCurrency(expense.amount)}</dd>
          <dt className="text-muted-foreground">Date</dt><dd>{formatDate(expense.expenseDate)}</dd>
          <dt className="text-muted-foreground">Category</dt><dd>{expense.category}</dd>
          <dt className="text-muted-foreground">Paid from</dt><dd>{expense.paidFrom}{expense.paymentReference ? ` · ${expense.paymentReference}` : ''}</dd>
          <dt className="text-muted-foreground">Location</dt><dd>{expense.branch ?? 'Head office'}</dd>
        </dl>
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'approve' | 'reject')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="approve"><CheckCircle2 className="mr-1.5 h-4 w-4" />Approve</TabsTrigger>
            <TabsTrigger value="reject"><XCircle className="mr-1.5 h-4 w-4" />Reject</TabsTrigger>
          </TabsList>
        </Tabs>
        {mode === 'approve' ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            Posts {formatCurrency(expense.amount)} to the books: charged to {expense.category}, paid from {expense.paidFrom}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">The accountant is told why. Nothing is posted.</p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="exp-note">{mode === 'approve' ? 'Note (optional)' : 'Reason'}</Label>
          <Textarea id="exp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={mode === 'reject' ? 'destructive' : 'default'} disabled={isPending || (mode === 'reject' && !note.trim())} onClick={submit}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{mode === 'approve' ? 'Approve and post' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Record ──────────────────────────────────────────────────────────────────

function RecordExpenseDialog({ open, onOpenChange, options, onRecorded }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  options: Options;
  onRecorded: () => void;
}) {
  const today = () => new Date().toISOString().slice(0, 10);
  const blank = () => ({
    expenseDate: today(), amount: '', payee: '', description: '',
    expenseAccountId: '', paymentAccountId: options.paymentAccounts[0]?.id ?? '',
    paymentMode: 'CASH', paymentReference: '', branchId: 'HQ',
  });
  const [form, setForm] = useState(blank);
  const [isPending, startTransition] = useTransition();
  const set = (k: keyof ReturnType<typeof blank>, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => startTransition(async () => {
    const r = await recordExpense({
      expenseDate: form.expenseDate,
      amount: Number(form.amount),
      payee: form.payee,
      description: form.description,
      expenseAccountId: form.expenseAccountId,
      paymentAccountId: form.paymentAccountId,
      paymentMode: form.paymentMode,
      paymentReference: form.paymentReference || undefined,
      branchId: form.branchId === 'HQ' ? null : form.branchId,
    });
    if (r.success) {
      toast.success(r.message);
      setForm(blank());
      onOpenChange(false);
      onRecorded();
    } else toast.error(r.error || 'Could not record the expense');
  });

  const ready = Number(form.amount) > 0 && form.payee.trim() && form.description.trim() && form.expenseAccountId && form.paymentAccountId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record an expense</DialogTitle>
          <DialogDescription>An admin approves it before it is posted to the books.</DialogDescription>
        </DialogHeader>
        {options.expenseAccounts.length === 0 || options.paymentAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Set up at least one expense account and one cash or bank account in the Chart of Accounts first.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-date">Date</Label>
              <Input id="e-date" type="date" max={today()} value={form.expenseDate} onChange={(e) => set('expenseDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-amount">Amount</Label>
              <Input id="e-amount" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="e-payee">Paid to</Label>
              <Input id="e-payee" placeholder="Vendor, landlord, utility..." value={form.payee} onChange={(e) => set('payee', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="e-desc">What was it for?</Label>
              <Textarea id="e-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.expenseAccountId} onValueChange={(v) => set('expenseAccountId', v)}>
                <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                <SelectContent>{options.expenseAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.accountCode} · {a.accountName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Paid from</Label>
              <Select value={form.paymentAccountId} onValueChange={(v) => set('paymentAccountId', v)}>
                <SelectTrigger><SelectValue placeholder="Choose..." /></SelectTrigger>
                <SelectContent>{options.paymentAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.accountCode} · {a.accountName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={form.paymentMode} onValueChange={(v) => set('paymentMode', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_MODES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-ref">Payment reference (optional)</Label>
              <Input id="e-ref" placeholder="Receipt, invoice or transfer ref" value={form.paymentReference} onChange={(e) => set('paymentReference', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Belongs to</Label>
              <Select value={form.branchId} onValueChange={(v) => set('branchId', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HQ">Head office</SelectItem>
                  {options.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={isPending || !ready}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
