'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Banknote,
  Download,
  Loader2,
  AlertTriangle,
  Receipt,
  Users,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
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
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  getPayrollPeriods,
  getPayslips,
  getPayslipDetail,
  getPayrollBankSchedule,
} from '@/actions/payroll.actions';
import type { SessionUser } from '@/types';

interface PayrollPeriodClientProps {
  periodId: string;
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

export function PayrollPeriodClient({ periodId, user }: PayrollPeriodClientProps) {
  const [period, setPeriod] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [bankSchedule, setBankSchedule] = useState<any>(null);
  const [selectedSlip, setSelectedSlip] = useState<any>(null);
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('HR:PAYROLL_MANAGE');

  useEffect(() => {
    startTransition(async () => {
      try {
        const [periods, slips] = await Promise.all([getPayrollPeriods(60), getPayslips(periodId)]);
        setPeriod(periods.find((p) => p.id === periodId) ?? null);
        setPayslips(slips);

        if (canManage) {
          try {
            setBankSchedule(await getPayrollBankSchedule(periodId));
          } catch {
            // Bank schedule needs HR:PAYROLL_MANAGE; the register still renders.
          }
        }
      } catch (e: any) {
        toast.error(e.message || 'Failed to load the payroll period');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  function openPayslip(payslipId: string) {
    startTransition(async () => {
      try {
        setSelectedSlip(await getPayslipDetail(payslipId));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load the payslip');
      }
    });
  }

  /** Export the bank schedule as CSV so it can be uploaded to the bank portal. */
  function exportBankSchedule() {
    if (!bankSchedule) return;

    const header = ['Employee ID', 'Name', 'Bank', 'Account Number', 'Amount'];
    const rows = bankSchedule.rows.map((r: any) => [
      r.employeeId,
      r.name,
      r.bankName ?? '',
      r.accountNumber ?? '',
      r.amount.toFixed(2),
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll-${bankSchedule.periodCode}-bank-schedule.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!period && !isPending) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/hr/payroll">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Payroll
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Payroll period not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/hr/payroll">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Payroll
            </Link>
          </Button>
          {period && (
            <div>
              <h1 className="text-xl font-bold tracking-tight">{period.code}</h1>
              <p className="text-sm text-muted-foreground">
                {formatDate(period.startDate)} – {formatDate(period.endDate)} · paid{' '}
                {formatDate(period.payDate)}
              </p>
            </div>
          )}
        </div>
        {period && (
          <Badge variant={STATUS_VARIANT[period.status] ?? 'default'}>
            {period.status.replace('_', ' ')}
          </Badge>
        )}
      </div>

      {period && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Staff', value: String(period.staffCount), color: 'indigo' as const, icon: Users },
            { label: 'Gross Earnings', value: formatCurrency(period.totalGross), color: 'emerald' as const, icon: Wallet },
            { label: 'Deductions', value: formatCurrency(period.totalDeductions), color: 'amber' as const, icon: Receipt },
            { label: 'Net Pay', value: formatCurrency(period.totalNet), color: 'teal' as const, icon: Banknote },
            { label: 'Employer Cost', value: formatCurrency(period.totalEmployerCost), color: 'purple' as const, icon: TrendingUp },
          ].map((stat) => (
            <StatCard
              key={stat.label}
              title={stat.label}
              color={stat.color}
              value={stat.value}
              icon={stat.icon}
            />
          ))}
        </div>
      )}

      {period?.journalEntryId && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            Posted to the general ledger. Journal reference{' '}
            <span className="font-mono">{period.journalEntryId.slice(0, 8)}</span>.
          </span>
          <Button size="sm" variant="ghost" asChild className="ml-auto">
            <Link href="/accounting/journal">View journal</Link>
          </Button>
        </div>
      )}

      <Tabs defaultValue="register">
        <TabsList>
          <TabsTrigger value="register">
            Payslip Register
            <Badge variant="secondary" className="ml-2">
              {payslips.length}
            </Badge>
          </TabsTrigger>
          {bankSchedule && <TabsTrigger value="bank">Bank Schedule</TabsTrigger>}
        </TabsList>

        <TabsContent value="register" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Payslips
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payslip</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Pay</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                        {isPending
                          ? 'Loading…'
                          : 'No payslips yet. Process the period to generate them.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {payslips.map((slip) => (
                    <TableRow key={slip.id}>
                      <TableCell className="font-mono text-xs">{slip.payslipNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{slip.staffName}</div>
                        <div className="text-xs text-muted-foreground">
                          {slip.employeeId}
                          {slip.jobTitle ? ` · ${slip.jobTitle}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{slip.department}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(slip.basicSalary)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(slip.grossEarnings)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCurrency(slip.totalDeductions)}
                        {slip.lopAmount > 0 && (
                          <div className="text-[11px] text-amber-600">
                            incl. {formatCurrency(slip.lopAmount)} LOP
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(slip.netPay)}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => openPayslip(slip.id)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {bankSchedule && (
          <TabsContent value="bank" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Banknote className="h-5 w-5" />
                  Bank Transfer Schedule
                </CardTitle>
                <Button size="sm" variant="outline" onClick={exportBankSchedule}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {bankSchedule.missingBankDetails > 0 && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      {bankSchedule.missingBankDetails} staff member(s) have no bank details on
                      file. Their payment cannot be transferred until this is fixed.
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">Total to transfer</span>
                  <span className="text-lg font-bold tabular-nums">
                    {formatCurrency(bankSchedule.totalAmount)}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Account Number</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankSchedule.rows.map((row: any) => (
                        <TableRow
                          key={row.employeeId}
                          className={!row.hasBankDetails ? 'bg-amber-500/5' : ''}
                        >
                          <TableCell className="font-mono text-xs">{row.employeeId}</TableCell>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>{row.bankName ?? <span className="text-amber-600">Missing</span>}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {row.accountNumber ?? '—'}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrency(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Payslip detail */}
      <Dialog open={Boolean(selectedSlip)} onOpenChange={(open) => !open && setSelectedSlip(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {selectedSlip && (
            <>
              <DialogHeader>
                <DialogTitle>Payslip {selectedSlip.payslipNumber}</DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Employee</p>
                    <p className="font-medium">{selectedSlip.staff.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedSlip.staff.employeeId}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Period</p>
                    <p className="font-medium">{selectedSlip.period.code}</p>
                    <p className="text-xs text-muted-foreground">
                      Paid {formatDate(selectedSlip.period.payDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Position</p>
                    <p className="font-medium">{selectedSlip.staff.jobTitle ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedSlip.staff.department}
                      {selectedSlip.gradeName ? ` · ${selectedSlip.gradeName}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payment</p>
                    <p className="font-medium">{selectedSlip.bankName ?? '—'}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {selectedSlip.bankAccountNumber ?? '—'}
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-2 text-sm font-semibold">Earnings</h4>
                  <div className="space-y-1.5">
                    {selectedSlip.earnings.map((line: any) => (
                      <div key={line.code} className="flex justify-between text-sm">
                        <span>{line.name}</span>
                        <span className="tabular-nums">{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-1.5 text-sm font-semibold">
                      <span>Gross Earnings</span>
                      <span className="tabular-nums">
                        {formatCurrency(selectedSlip.grossEarnings)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold">Deductions</h4>
                  <div className="space-y-1.5">
                    {selectedSlip.deductions.length === 0 && (
                      <p className="text-sm text-muted-foreground">No deductions</p>
                    )}
                    {selectedSlip.deductions.map((line: any) => (
                      <div key={line.code} className="flex justify-between text-sm">
                        <span>{line.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          ({formatCurrency(line.amount)})
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-1.5 text-sm font-semibold">
                      <span>Total Deductions</span>
                      <span className="tabular-nums">
                        ({formatCurrency(selectedSlip.totalDeductions)})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md bg-primary/10 p-4">
                  <span className="font-semibold">Net Pay</span>
                  <span className="text-2xl font-bold tabular-nums">
                    {formatCurrency(selectedSlip.netPay)}
                  </span>
                </div>

                {selectedSlip.employerContributions.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                      Employer Contributions (not deducted from pay)
                    </h4>
                    <div className="space-y-1.5">
                      {selectedSlip.employerContributions.map((line: any) => (
                        <div
                          key={line.code}
                          className="flex justify-between text-sm text-muted-foreground"
                        >
                          <span>{line.name}</span>
                          <span className="tabular-nums">{formatCurrency(line.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-4 gap-3 text-center text-sm">
                  <div>
                    <p className="text-muted-foreground">Working days</p>
                    <p className="font-semibold tabular-nums">{selectedSlip.workingDays}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Present</p>
                    <p className="font-semibold tabular-nums">{selectedSlip.daysPresent}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Absent</p>
                    <p className="font-semibold tabular-nums">{selectedSlip.daysAbsent}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Loss of pay</p>
                    <p className="font-semibold tabular-nums">
                      {selectedSlip.lopAmount > 0 ? formatCurrency(selectedSlip.lopAmount) : '—'}
                    </p>
                  </div>
                </div>

                {(selectedSlip.staff.pensionPin || selectedSlip.staff.taxId) && (
                  <p className="text-xs text-muted-foreground">
                    {selectedSlip.staff.pensionPin && `Pension PIN: ${selectedSlip.staff.pensionPin}`}
                    {selectedSlip.staff.pensionPin && selectedSlip.staff.taxId && ' · '}
                    {selectedSlip.staff.taxId && `Tax ID: ${selectedSlip.staff.taxId}`}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
