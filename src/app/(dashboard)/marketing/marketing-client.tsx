'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Plus, CheckCircle2, XCircle, Clock, Wallet, Target, Trophy,
  Loader2, RefreshCw, ChevronLeft, ChevronRight, Search, Medal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
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
import { SALE_TYPE_LABELS, monthKey, type SaleType } from '@/lib/marketing-access';
import {
  getSales, getLeaderboard, getMarketingSummary, getMarketers,
  confirmSale, rejectSale, markCommissionPaid, setTarget,
  type MarketingSaleRow, type SaleFilters,
} from '@/actions/marketing.actions';
import { ReportSaleDialog } from './report-sale-dialog';
import { SalesReportPanel } from './sales-report-panel';

type Access = { isMarketer: boolean; canConfirm: boolean; userId: string };
type Summary = Awaited<ReturnType<typeof getMarketingSummary>>;
type Board = Awaited<ReturnType<typeof getLeaderboard>>;

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error' | 'info'> = {
  PENDING: 'warning', CONFIRMING: 'info', CONFIRMED: 'success', REJECTED: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Awaiting confirmation', CONFIRMING: 'Being confirmed', CONFIRMED: 'Confirmed', REJECTED: 'Rejected',
};

/** The last twelve months as YYYY-MM, newest first, for month pickers. */
function recentMonths(): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: monthKey(d), label: d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) };
  });
}

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const months = useMemo(() => recentMonths(), []);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function MarketingClient({ access }: { access: Access }) {
  const { isMarketer, canConfirm } = access;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    getMarketingSummary().then(setSummary).catch((e) => toast.error(e.message));
  }, [refreshKey]);

  const defaultTab = canConfirm ? 'queue' : 'mine';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <TrendingUp className="h-6 w-6" /> Sales
          </h1>
          <p className="text-muted-foreground">
            {canConfirm
              ? 'Confirm sales reported by Marketing. Money collected in the field is posted only when you confirm it.'
              : 'Report the customers you bring in and the money you collect. Senior staff confirm each sale.'}
          </p>
        </div>
        {isMarketer && (
          <Button onClick={() => setReportOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Report a sale
          </Button>
        )}
      </div>

      {summary && <SummaryCards summary={summary} forConfirmer={canConfirm} />}

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="w-max">
            {canConfirm && <TabsTrigger value="queue">To confirm{summary?.pendingCount ? ` (${summary.pendingCount})` : ''}</TabsTrigger>}
            {isMarketer && <TabsTrigger value="mine">My sales</TabsTrigger>}
            {canConfirm && <TabsTrigger value="all">All sales</TabsTrigger>}
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="report">{canConfirm ? 'Company report' : 'My report'}</TabsTrigger>
            {canConfirm && <TabsTrigger value="targets">Targets</TabsTrigger>}
            {canConfirm && <TabsTrigger value="commission">Commission</TabsTrigger>}
          </TabsList>
        </div>

        {canConfirm && (
          <TabsContent value="queue">
            <SalesPanel key={`q-${refreshKey}`} fixed={{ status: 'PENDING' }} reviewable access={access} onChanged={refresh} emptyText="Nothing waiting for confirmation." />
          </TabsContent>
        )}
        {isMarketer && (
          <TabsContent value="mine">
            <SalesPanel key={`m-${refreshKey}`} fixed={{}} access={access} onChanged={refresh} showStatusFilter emptyText="You have not reported any sales yet." mineOnly />
          </TabsContent>
        )}
        {canConfirm && (
          <TabsContent value="all">
            <SalesPanel key={`a-${refreshKey}`} fixed={{}} access={access} onChanged={refresh} showStatusFilter showSearch emptyText="No sales match." />
          </TabsContent>
        )}
        <TabsContent value="leaderboard">
          <LeaderboardPanel key={`l-${refreshKey}`} access={access} />
        </TabsContent>
        <TabsContent value="report">
          <SalesReportPanel key={`r-${refreshKey}`} company={canConfirm} />
        </TabsContent>
        {canConfirm && (
          <TabsContent value="targets">
            <TargetsPanel onChanged={refresh} />
          </TabsContent>
        )}
        {canConfirm && (
          <TabsContent value="commission">
            <CommissionPanel key={`c-${refreshKey}`} access={access} onChanged={refresh} />
          </TabsContent>
        )}
      </Tabs>

      <ReportSaleDialog open={reportOpen} onOpenChange={setReportOpen} onReported={refresh} />
    </div>
  );
}

// ── Summary ─────────────────────────────────────────────────────────────────

function SummaryCards({ summary, forConfirmer }: { summary: Summary; forConfirmer: boolean }) {
  const progress = summary.targetAmount ? Math.min(100, Math.round((summary.confirmedAmount / summary.targetAmount) * 100)) : undefined;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title={forConfirmer ? 'Awaiting confirmation' : 'Awaiting confirmation'}
        color="amber" icon={Clock}
        value={summary.pendingCount}
        description={`${formatCurrency(summary.pendingAmount)} reported`}
      />
      <StatCard
        title="Confirmed this month" color="emerald" icon={CheckCircle2}
        value={formatCurrency(summary.confirmedAmount)}
        description={
          !forConfirmer && summary.targetAmount
            ? `${progress}% of ${formatCurrency(summary.targetAmount)} target`
            : `${summary.confirmedCount} sale${summary.confirmedCount === 1 ? '' : 's'}`
        }
        progress={!forConfirmer ? progress : undefined}
      />
      <StatCard
        title="Commission this month" color="violet" icon={Wallet}
        value={formatCurrency(summary.commissionThisMonth)}
        description="On confirmed sales"
      />
      <StatCard
        title="Commission unpaid" color="rose" icon={Wallet}
        value={formatCurrency(summary.commissionUnpaid)}
        description={forConfirmer ? 'Owed to marketers' : 'Owed to you'}
      />
    </div>
  );
}

// ── Sales list, with review ─────────────────────────────────────────────────

function SalesPanel({
  fixed, access, onChanged, reviewable = false, showStatusFilter = false, showSearch = false, mineOnly = false, emptyText,
}: {
  fixed: SaleFilters;
  access: Access;
  onChanged: () => void;
  reviewable?: boolean;
  showStatusFilter?: boolean;
  showSearch?: boolean;
  mineOnly?: boolean;
  emptyText: string;
}) {
  const [rows, setRows] = useState<MarketingSaleRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<MarketingSaleRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = (page = 1) =>
    startTransition(async () => {
      try {
        const result = await getSales({
          ...fixed,
          status: fixed.status ?? (status || undefined),
          search: search || undefined,
          marketerId: mineOnly ? access.userId : undefined,
          page,
        });
        setRows(result.data);
        setPagination(result.pagination);
      } catch (e: any) {
        toast.error(e.message || 'Could not load sales');
      }
    });

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <Card>
      {(showStatusFilter || showSearch) && (
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {showSearch && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Reference, customer, marketer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load(1)}
              />
            </div>
          )}
          {showStatusFilter && (
            <Select value={status || 'ALL'} onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="PENDING">Awaiting confirmation</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          )}
          {showSearch && <Button variant="outline" onClick={() => load(1)}><Search className="mr-2 h-4 w-4" />Search</Button>}
        </CardHeader>
      )}
      <CardContent className={showStatusFilter || showSearch ? '' : 'pt-6'}>
        {isPending ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />Loading...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale</TableHead>
                  {!mineOnly && <TableHead>Marketer</TableHead>}
                  <TableHead>Customer · For</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  {reviewable && <TableHead className="text-right">Review</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{emptyText}</TableCell>
                  </TableRow>
                ) : rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-mono text-xs">{s.reference}</div>
                      <div className="text-sm">{SALE_TYPE_LABELS[s.type]}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(s.collectedAt)}</div>
                    </TableCell>
                    {!mineOnly && (
                      <TableCell>
                        <div className="text-sm font-medium">{s.marketer}</div>
                        <div className="text-xs text-muted-foreground">{s.branch ?? 'Head office'}</div>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="text-sm">{s.customer}</div>
                      {s.target && (
                        <Link href={s.target.href} className="text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-400">
                          {s.target.label}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatCurrency(s.amount)}
                      <div className="text-xs text-muted-foreground">{s.paymentMode.replace(/_/g, ' ').toLowerCase()}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status] ?? 'info'}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                      {s.status === 'REJECTED' && s.reviewNote && (
                        <div className="mt-1 max-w-[220px] text-xs text-muted-foreground">{s.reviewNote}</div>
                      )}
                      {s.postedReference && <div className="mt-1 font-mono text-xs text-muted-foreground">Posted {s.postedReference}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {s.commissionAmount != null ? (
                        <>
                          {formatCurrency(s.commissionAmount)}
                          <div className="text-xs text-muted-foreground">{s.commissionPaidAt ? 'Paid' : 'Unpaid'}</div>
                        </>
                      ) : '—'}
                    </TableCell>
                    {reviewable && (
                      <TableCell className="text-right">
                        {s.marketerId === access.userId
                          ? <span className="text-xs text-muted-foreground">Your own sale</span>
                          : <Button size="sm" onClick={() => setReviewing(s)}>Review</Button>}
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
            <p className="text-sm text-muted-foreground">{pagination.total} sales</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />Previous
              </Button>
              <span className="text-sm">Page {pagination.page} of {pagination.totalPages}</span>
              <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)}>
                Next<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {reviewing && (
        <ReviewDialog key={reviewing.id} sale={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); onChanged(); }} />
      )}
    </Card>
  );
}

/** Mounted fresh for each sale (keyed by id), so its form starts clean. */
function ReviewDialog({ sale, onClose, onDone }: { sale: MarketingSaleRow; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'confirm' | 'reject'>('confirm');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const isCollection = sale.type === 'FIELD_COLLECTION';
  const effect = isCollection
    ? sale.target?.kind === 'LOAN'
      ? `Posts a repayment of ${formatCurrency(sale.amount)} on loan ${sale.target.label}, then records commission.`
      : `Posts a deposit of ${formatCurrency(sale.amount)} into savings ${sale.target?.label}, then records commission.`
    : `Credits ${sale.marketer} with this ${SALE_TYPE_LABELS[sale.type].toLowerCase()} and records commission. No money is posted — ${sale.target?.label} is already on the books.`;

  const submit = () =>
    startTransition(async () => {
      const result = mode === 'confirm' ? await confirmSale(sale.id, note) : await rejectSale(sale.id, note);
      if (result.success) { toast.success(result.message); onDone(); }
      else toast.error(result.error || 'Could not update the sale');
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review {sale.reference}</DialogTitle>
          <DialogDescription>{SALE_TYPE_LABELS[sale.type]} reported by {sale.marketer}</DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Customer</dt><dd>{sale.customer} <span className="text-xs text-muted-foreground">{sale.customerNumber}</span></dd>
          <dt className="text-muted-foreground">For</dt>
          <dd>{sale.target ? <Link href={sale.target.href} className="text-indigo-700 hover:underline dark:text-indigo-400">{sale.target.label}</Link> : '—'}</dd>
          <dt className="text-muted-foreground">Amount</dt><dd className="tabular-nums">{formatCurrency(sale.amount)}</dd>
          <dt className="text-muted-foreground">Paid by</dt><dd>{sale.paymentMode.replace(/_/g, ' ').toLowerCase()}{sale.paymentReference ? ` · ${sale.paymentReference}` : ''}</dd>
          <dt className="text-muted-foreground">Date</dt><dd>{formatDate(sale.collectedAt)}</dd>
          {sale.notes && <><dt className="text-muted-foreground">Notes</dt><dd>{sale.notes}</dd></>}
        </dl>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'confirm' | 'reject')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="confirm"><CheckCircle2 className="mr-1.5 h-4 w-4" />Confirm</TabsTrigger>
            <TabsTrigger value="reject"><XCircle className="mr-1.5 h-4 w-4" />Reject</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'confirm' ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{effect}</p>
        ) : (
          <p className="text-sm text-muted-foreground">The marketer is told why. Nothing is posted.</p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="review-note">{mode === 'confirm' ? 'Note (optional)' : 'Reason'}</Label>
          <Textarea id="review-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant={mode === 'reject' ? 'destructive' : 'default'}
            onClick={submit}
            disabled={isPending || (mode === 'reject' && !note.trim())}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'confirm' ? (isCollection ? 'Confirm and post' : 'Confirm') : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

function LeaderboardPanel({ access }: { access: Access }) {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    getLeaderboard(month).then(setBoard).catch((e) => toast.error(e.message));
  }, [month]);
  const loading = !board || board.month !== month;

  const medal = (rank: number) =>
    rank === 1 ? 'text-amber-500' : rank === 2 ? 'text-slate-400' : rank === 3 ? 'text-orange-600' : 'text-transparent';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Trophy className="h-5 w-5" />Leaderboard</CardTitle>
        <MonthPicker value={month} onChange={setMonth} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading...</div>
        ) : board.rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No one is in the Marketing department yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Marketer</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead className="min-w-[180px]">Target</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.rows.map((r) => (
                  <TableRow key={r.marketerId} className={r.marketerId === access.userId ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : undefined}>
                    <TableCell>
                      <span className="flex items-center gap-1 font-semibold tabular-nums">
                        {r.rank}<Medal className={`h-4 w-4 ${medal(r.rank)}`} />
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{r.name}{r.marketerId === access.userId && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</div>
                      <div className="text-xs text-muted-foreground">{r.branch ?? 'Head office'}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatCurrency(r.confirmedAmount)}
                      <div className="text-xs text-muted-foreground">{r.confirmedCount} sale{r.confirmedCount === 1 ? '' : 's'}</div>
                    </TableCell>
                    <TableCell>
                      {r.targetAmount != null ? (
                        <div className="space-y-1">
                          <Progress value={r.progress ?? 0} className="h-2" />
                          <div className="text-xs text-muted-foreground">
                            {r.progress ?? 0}% of {formatCurrency(r.targetAmount)}
                            {r.targetCount != null && ` · ${r.confirmedCount}/${r.targetCount} sales`}
                          </div>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">No target set</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.pendingCount}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {r.commission != null ? formatCurrency(r.commission) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Targets ─────────────────────────────────────────────────────────────────

function TargetsPanel({ onChanged }: { onChanged: () => void }) {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [marketers, setMarketers] = useState<Awaited<ReturnType<typeof getMarketers>> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { amount: string; count: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMarketers(), getLeaderboard(month)])
      .then(([people, board]) => {
        setMarketers(people);
        setLoadedMonth(board.month);
        const byId = new Map(board.rows.map((r) => [r.marketerId, r]));
        setDrafts(Object.fromEntries(people.map((p) => {
          const r = byId.get(p.id);
          return [p.id, { amount: r?.targetAmount != null ? String(r.targetAmount) : '', count: r?.targetCount != null ? String(r.targetCount) : '' }];
        })));
      })
      .catch((e) => toast.error(e.message));
  }, [month]);

  const save = async (marketerId: string) => {
    const d = drafts[marketerId];
    setSaving(marketerId);
    const result = await setTarget({
      marketerId, month,
      targetAmount: Number(d?.amount || 0),
      targetCount: d?.count ? Number(d.count) : null,
    });
    setSaving(null);
    if (result.success) { toast.success(result.message); onChanged(); }
    else toast.error(result.error || 'Could not save the target');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Target className="h-5 w-5" />Monthly targets</CardTitle>
        <MonthPicker value={month} onChange={setMonth} />
      </CardHeader>
      <CardContent>
        {!marketers || loadedMonth !== month ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading...</div>
        ) : marketers.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No one is in the Marketing department yet. Put staff in the Marketing department from People.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marketer</TableHead>
                  <TableHead>Target amount</TableHead>
                  <TableHead>Target sales (optional)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {marketers.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.employeeId} · {m.branch ?? 'Head office'}</div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min="0" className="w-40"
                        value={drafts[m.id]?.amount ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: { ...d[m.id], amount: e.target.value } }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min="0" step="1" className="w-28"
                        value={drafts[m.id]?.count ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: { ...d[m.id], count: e.target.value } }))}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={saving === m.id} onClick={() => save(m.id)}>
                        {saving === m.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Commission ──────────────────────────────────────────────────────────────

function CommissionPanel({ access, onChanged }: { access: Access; onChanged: () => void }) {
  const [rows, setRows] = useState<MarketingSaleRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getSales({ commission: 'UNPAID', limit: 100 })
      .then((r) => setRows(r.data))
      .catch((e) => toast.error(e.message));
  }, []);

  const payable = (rows ?? []).filter((r) => r.marketerId !== access.userId);
  const total = payable.filter((r) => selected.has(r.id)).reduce((sum, r) => sum + (r.commissionAmount ?? 0), 0);
  const allSelected = payable.length > 0 && payable.every((r) => selected.has(r.id));

  const byMarketer = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();
    for (const r of rows ?? []) {
      const entry = map.get(r.marketerId) ?? { name: r.marketer ?? '', amount: 0, count: 0 };
      entry.amount += r.commissionAmount ?? 0;
      entry.count += 1;
      map.set(r.marketerId, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const pay = () => startTransition(async () => {
    const result = await markCommissionPaid(Array.from(selected));
    if (result.success) {
      toast.success(result.message);
      setRows((r) => (r ?? []).filter((s) => !selected.has(s.id)));
      setSelected(new Set());
      onChanged();
    } else toast.error(result.error || 'Could not update commission');
  });

  return (
    <div className="space-y-4">
      {byMarketer.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {byMarketer.map((m) => (
            <Card key={m.name}>
              <CardContent className="p-4">
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-lg font-semibold tabular-nums">{formatCurrency(m.amount)}</div>
                <div className="text-xs text-muted-foreground">owed on {m.count} sale{m.count === 1 ? '' : 's'}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg"><Wallet className="h-5 w-5" />Unpaid commission</CardTitle>
          <Button disabled={selected.size === 0 || isPending} onClick={pay}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mark {selected.size || ''} paid{selected.size ? ` · ${formatCurrency(total)}` : ''}
          </Button>
        </CardHeader>
        <CardContent>
          {!rows ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading...</div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No commission is owed.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(payable.map((r) => r.id)))}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Sale</TableHead>
                    <TableHead>Marketer</TableHead>
                    <TableHead>Confirmed</TableHead>
                    <TableHead className="text-right">Sale amount</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.marketerId !== access.userId && (
                          <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.reference}`} />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">{r.reference}</div>
                        <div className="text-xs text-muted-foreground">{SALE_TYPE_LABELS[r.type as SaleType]}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.marketer}</TableCell>
                      <TableCell className="text-xs">{r.reviewedAt ? formatDate(r.reviewedAt) : '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(r.commissionAmount ?? 0)}
                        <div className="text-xs text-muted-foreground">{r.commissionRate}%</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
