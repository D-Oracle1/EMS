'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Receipt, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { getMyPayslips, getPayslipDetail } from '@/actions/payroll.actions';
import type { SessionUser } from '@/types';

interface MyPayslipsClientProps {
  user: SessionUser;
}

export function MyPayslipsClient({ user }: MyPayslipsClientProps) {
  const [payslips, setPayslips] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        setPayslips(await getMyPayslips());
      } catch (e: any) {
        toast.error(e.message || 'Failed to load payslips');
      }
    });
  }, []);

  function open(id: string) {
    startTransition(async () => {
      try {
        setSelected(await getPayslipDetail(id));
      } catch (e: any) {
        toast.error(e.message || 'Failed to load the payslip');
      }
    });
  }

  const ytdNet = payslips.reduce((sum, p) => sum + p.netPay, 0);
  const ytdGross = payslips.reduce((sum, p) => sum + p.grossEarnings, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Link href="/hr" className="text-sm text-muted-foreground hover:underline">
            Human Resources
          </Link>
          <span className="text-muted-foreground">/</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">My Payslips</h1>
        <p className="text-muted-foreground">
          Your pay history, {user.firstName}. Only approved runs appear here.
        </p>
      </div>

      {payslips.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard title="Payslips" color="slate" value={payslips.length} icon={Receipt} />
          <StatCard
            title="Total Gross"
            color="sky"
            value={formatCurrency(ytdGross)}
            icon={FileText}
          />
          <StatCard
            title="Total Net Received"
            color="emerald"
            value={formatCurrency(ytdNet)}
            icon={Receipt}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5" />
            Pay History
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Pay Date</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payslips.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    {isPending ? 'Loading…' : 'No payslips available yet.'}
                  </TableCell>
                </TableRow>
              )}
              {payslips.map((slip) => (
                <TableRow key={slip.id}>
                  <TableCell className="font-medium">{slip.periodCode}</TableCell>
                  <TableCell>{formatDate(slip.payDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(slip.grossEarnings)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(slip.totalDeductions)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(slip.netPay)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={slip.status === 'PAID' ? 'success' : 'info'}>
                      {slip.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => open(slip.id)}>
                      <FileText className="mr-1 h-3.5 w-3.5" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Payslip {selected.payslipNumber}</DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Period</p>
                    <p className="font-medium">{selected.period.code}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pay Date</p>
                    <p className="font-medium">{formatDate(selected.period.payDate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Position</p>
                    <p className="font-medium">{selected.staff.jobTitle ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Paid Into</p>
                    <p className="font-medium">{selected.bankName ?? '—'}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {selected.bankAccountNumber ?? '—'}
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-2 text-sm font-semibold">Earnings</h4>
                  <div className="space-y-1.5">
                    {selected.earnings.map((line: any) => (
                      <div key={line.code} className="flex justify-between text-sm">
                        <span>{line.name}</span>
                        <span className="tabular-nums">{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t pt-1.5 text-sm font-semibold">
                      <span>Gross</span>
                      <span className="tabular-nums">{formatCurrency(selected.grossEarnings)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold">Deductions</h4>
                  <div className="space-y-1.5">
                    {selected.deductions.length === 0 && (
                      <p className="text-sm text-muted-foreground">No deductions</p>
                    )}
                    {selected.deductions.map((line: any) => (
                      <div key={line.code} className="flex justify-between text-sm">
                        <span>{line.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          ({formatCurrency(line.amount)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-md bg-primary/10 p-4">
                  <span className="font-semibold">Net Pay</span>
                  <span className="text-2xl font-bold tabular-nums">
                    {formatCurrency(selected.netPay)}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-3 text-center text-sm">
                  <div>
                    <p className="text-muted-foreground">Working days</p>
                    <p className="font-semibold tabular-nums">{selected.workingDays}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Present</p>
                    <p className="font-semibold tabular-nums">{selected.daysPresent}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Absent</p>
                    <p className="font-semibold tabular-nums">{selected.daysAbsent}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Loss of pay</p>
                    <p className="font-semibold tabular-nums">
                      {selected.lopAmount > 0 ? formatCurrency(selected.lopAmount) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
