'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Plus,
  Play,
  CheckCircle2,
  Banknote,
  XCircle,
  Loader2,
  TrendingUp,
  AlertTriangle,
  UserCog,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  getPayrollPeriods,
  createPayrollPeriod,
  processPayrollPeriod,
  approvePayrollPeriod,
  markPayrollPaid,
  cancelPayrollPeriod,
  getCompensationCoverage,
} from '@/actions/payroll.actions';
import { getPayrollAnalytics } from '@/actions/hr-analytics.actions';
import type { SessionUser } from '@/types';

interface PayrollClientProps {
  user: SessionUser;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
  DRAFT: 'secondary',
  PROCESSING: 'info',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  PAID: 'success',
  CANCELLED: 'error',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function PayrollClient({ user }: PayrollClientProps) {
  const [periods, setPeriods] = useState<any[]>([]);
  const [coverage, setCoverage] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const now = new Date();
  const [form, setForm] = useState({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    payDate: '',
    notes: '',
  });

  const canManage = user.permissions.includes('HR:PAYROLL_MANAGE');
  const canApprove = user.permissions.includes('HR:PAYROLL_APPROVE');

  function load() {
    startTransition(async () => {
      try {
        const [p, c] = await Promise.all([getPayrollPeriods(), getCompensationCoverage()]);
        setPeriods(p);
        setCoverage(c);
        try {
          setAnalytics(await getPayrollAnalytics(12));
        } catch {
          // Analytics needs its own permission; the rest of the page still works.
        }
      } catch (e: any) {
        toast.error(e.message || 'Failed to load payroll');
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  function handleCreate() {
    const year = parseInt(form.year, 10);
    const month = parseInt(form.month, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      toast.error('Select a valid year and month');
      return;
    }

    startTransition(async () => {
      const result = await createPayrollPeriod({
        year,
        month,
        payDate: form.payDate || undefined,
        notes: form.notes || undefined,
      });
      if (result.success) {
        toast.success(result.message);
        setCreateOpen(false);
        load();
      } else {
        toast.error(result.error || 'Failed to open the period');
      }
    });
  }

  function runAction(
    id: string,
    action: () => Promise<{ success: boolean; message?: string; error?: string }>
  ) {
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Action failed');
      }
    });
  }

  function handleCancel() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      toast.error('A reason is required');
      return;
    }
    startTransition(async () => {
      const result = await cancelPayrollPeriod(cancelTarget.id, cancelReason.trim());
      if (result.success) {
        toast.success(result.message);
        setCancelTarget(null);
        setCancelReason('');
        load();
      } else {
        toast.error(result.error || 'Failed to cancel');
      }
    });
  }

  const withoutPackage = coverage.filter((c) => !c.hasCompensation);
  const withoutBank = coverage.filter((c) => c.hasCompensation && !c.hasBankDetails);
  const latest = analytics?.latest;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/hr" className="text-sm text-muted-foreground hover:underline">
              Human Resources
            </Link>
            <span className="text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">
            Monthly runs post to the general ledger on approval.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Open Period
          </Button>
        )}
      </div>

      {/* Readiness warnings */}
      {(withoutPackage.length > 0 || withoutBank.length > 0) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center gap-4 py-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1 space-y-1">
              {withoutPackage.length > 0 && (
                <p>
                  <strong>{withoutPackage.length}</strong> active staff have no salary package and
                  will be skipped by the next run.
                </p>
              )}
              {withoutBank.length > 0 && (
                <p>
                  <strong>{withoutBank.length}</strong> staff have a package but no bank details —
                  their net pay cannot be transferred.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Latest run summary */}
      {latest && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Last Run Gross</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatCurrency(latest.gross)}
              </p>
              {analytics.monthOnMonthChange !== null && (
                <p
                  className={`mt-1 text-xs ${
                    analytics.monthOnMonthChange >= 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {analytics.monthOnMonthChange >= 0 ? '+' : ''}
                  {analytics.monthOnMonthChange}% vs previous month
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Net Paid</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(latest.net)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{latest.code}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Cost to Company</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatCurrency(latest.costToCompany)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Gross plus employer contributions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Average per Head</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatCurrency(latest.averageCost)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{latest.staffCount} staff</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="periods">
        <TabsList>
          <TabsTrigger value="periods">Payroll Periods</TabsTrigger>
          <TabsTrigger value="coverage">
            Salary Packages
            {withoutPackage.length > 0 && (
              <Badge variant="warning" className="ml-2">
                {withoutPackage.length}
              </Badge>
            )}
          </TabsTrigger>
          {analytics && <TabsTrigger value="analytics">Cost Analytics</TabsTrigger>}
        </TabsList>

        {/* Periods */}
        <TabsContent value="periods" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5" />
                Payroll Periods
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Pay Date</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No payroll periods yet. Open one to begin.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {periods.map((period) => {
                    const busy = busyId === period.id;
                    return (
                      <TableRow key={period.id}>
                        <TableCell>
                          <Link
                            href={`/hr/payroll/${period.id}`}
                            className="font-medium hover:underline"
                          >
                            {period.code}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {MONTHS[period.month - 1]} {period.year}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(period.payDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {period.staffCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(period.totalGross)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(period.totalDeductions)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(period.totalNet)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[period.status] ?? 'default'}>
                            {period.status.replace('_', ' ')}
                          </Badge>
                          {period.journalEntryId && (
                            <div className="mt-1 text-[11px] text-muted-foreground">posted</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {canManage &&
                              ['DRAFT', 'PROCESSING', 'PENDING_APPROVAL'].includes(period.status) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy || isPending}
                                  onClick={() =>
                                    runAction(period.id, () => processPayrollPeriod(period.id))
                                  }
                                  title="Compute payslips"
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              )}
                            {canApprove && period.status === 'PENDING_APPROVAL' && (
                              <Button
                                size="sm"
                                disabled={busy || isPending}
                                onClick={() =>
                                  runAction(period.id, () => approvePayrollPeriod(period.id, true))
                                }
                                title="Approve and post to the ledger"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canApprove && period.status === 'APPROVED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || isPending}
                                onClick={() => runAction(period.id, () => markPayrollPaid(period.id))}
                                title="Mark as paid"
                              >
                                <Banknote className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canApprove &&
                              !['PAID', 'CANCELLED'].includes(period.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy || isPending}
                                  onClick={() => setCancelTarget(period)}
                                  title="Cancel this run"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/hr/payroll/${period.id}`}>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Coverage */}
        <TabsContent value="coverage" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserCog className="h-5 w-5" />
                Salary Package Coverage
                <Badge variant="secondary">
                  {coverage.filter((c) => c.hasCompensation).length}/{coverage.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Basic Salary</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead>Bank Details</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.map((row) => (
                    <TableRow key={row.id} className={!row.hasCompensation ? 'bg-amber-500/5' : ''}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.employeeId}
                          {row.jobTitle ? ` · ${row.jobTitle}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{row.department}</TableCell>
                      <TableCell className="text-sm">{row.grade ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.basicSalary != null ? formatCurrency(row.basicSalary) : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.effectiveFrom ? formatDate(row.effectiveFrom) : '—'}
                      </TableCell>
                      <TableCell>
                        {row.hasBankDetails ? (
                          <Badge variant="success">On file</Badge>
                        ) : (
                          <Badge variant="warning">Missing</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/hr/staff?staffId=${row.id}`}>
                              {row.hasCompensation ? 'Review' : 'Set package'}
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics */}
        {analytics && (
          <TabsContent value="analytics" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5" />
                  Payroll Cost Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics.trend}
                      margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                      <XAxis dataKey="code" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        formatter={(value: any) => formatCurrency(Number(value))}
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--background))',
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="gross" name="Gross" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="net" name="Net" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {analytics.byDepartment.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Cost by Department — Latest Run</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Staff</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.byDepartment.map((row: any) => {
                        const total = analytics.byDepartment.reduce(
                          (sum: number, r: any) => sum + r.gross,
                          0
                        );
                        return (
                          <TableRow key={row.department}>
                            <TableCell className="font-medium">{row.department}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.staffCount}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(row.gross)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {total > 0 ? `${((row.gross / total) * 100).toFixed(1)}%` : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Open period */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open Payroll Period</DialogTitle>
            <DialogDescription>
              One period per calendar month. Payslips are computed when you process it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pp-month">Month</Label>
                <Select value={form.month} onValueChange={(v) => setForm({ ...form, month: v })}>
                  <SelectTrigger id="pp-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month, index) => (
                      <SelectItem key={month} value={String(index + 1)}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pp-year">Year</Label>
                <Input
                  id="pp-year"
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-paydate">Pay Date</Label>
              <Input
                id="pp-paydate"
                type="date"
                value={form.payDate}
                onChange={(e) => setForm({ ...form, payDate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the configured pay day of the month.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pp-notes">Notes</Label>
              <Textarea
                id="pp-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Anything unusual about this run"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Open Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel run */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Payroll Run</DialogTitle>
            <DialogDescription>
              {cancelTarget &&
                `${cancelTarget.code} — this deletes ${cancelTarget.payslipCount} payslip(s) and cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Why is this run being cancelled?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Keep Run
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isPending}>
              Cancel Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
