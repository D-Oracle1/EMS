'use client';

import { useEffect, useState, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Landmark,
  User,
  CalendarDays,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  getFixedDeposit,
  withdrawFixedDeposit,
  matureFixedDeposit,
} from '@/actions/fixed-deposit.actions';

const statusVariant: Record<string, 'success' | 'info' | 'error' | 'default'> = {
  ACTIVE: 'success',
  MATURED: 'info',
  PREMATURE_CLOSED: 'error',
};

const statusLabel: Record<string, string> = {
  ACTIVE: 'Active',
  MATURED: 'Matured',
  PREMATURE_CLOSED: 'Premature Closed',
};

const paymentStatusVariant: Record<string, 'success' | 'warning' | 'default'> = {
  PAID: 'success',
  PENDING: 'warning',
};

export default function FixedDepositDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [fd, setFd] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [matureOpen, setMatureOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchFd = () => {
    setLoading(true);
    startTransition(async () => {
      try {
        const result = await getFixedDeposit(id);
        setFd(result);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load fixed deposit');
      } finally {
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    if (id) fetchFd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleMature = () => {
    startTransition(async () => {
      try {
        const result = await matureFixedDeposit(id);
        if (result.success) {
          toast.success(result.message || 'Fixed deposit liquidated at maturity');
          setMatureOpen(false);
          fetchFd();
        } else {
          toast.error(result.error || 'Maturity liquidation failed');
        }
      } catch (error: any) {
        toast.error(error.message || 'Maturity liquidation failed');
      }
    });
  };

  const handleWithdraw = () => {
    if (!withdrawReason.trim()) {
      toast.error('Please provide a reason for premature withdrawal');
      return;
    }

    startTransition(async () => {
      try {
        const result = await withdrawFixedDeposit(id, withdrawReason.trim());
        if (result.success) {
          toast.success(result.message || 'Fixed deposit withdrawn successfully');
          setWithdrawOpen(false);
          setWithdrawReason('');
          fetchFd();
        } else {
          toast.error(result.error || 'Withdrawal failed');
        }
      } catch (error: any) {
        toast.error(error.message || 'Withdrawal failed');
      }
    });
  };

  if (loading && !fd) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/fixed-deposits">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading fixed deposit details...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!fd) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/fixed-deposits">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Fixed deposit not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/fixed-deposits">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {fd.certificateNumber}
            </h1>
            <p className="text-muted-foreground">
              {fd.customer?.firstName} {fd.customer?.lastName}
            </p>
          </div>
          <Badge variant={statusVariant[fd.status] || 'default'}>
            {statusLabel[fd.status] || fd.status}
          </Badge>
        </div>
        <div className="flex gap-2">
          {fd.status === 'MATURED' && (
            <Button
              variant="default"
              onClick={() => setMatureOpen(true)}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Liquidate at Maturity
            </Button>
          )}
          {fd.status === 'ACTIVE' && (
            <Button
              variant="destructive"
              onClick={() => setWithdrawOpen(true)}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Premature Withdrawal
            </Button>
          )}
        </div>
      </div>

      {/* FD Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Fixed Deposit Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Principal Amount</span>
              <span className="font-medium">
                {formatCurrency(fd.principalAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interest Rate</span>
              <span className="font-medium">{fd.interestRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tenure</span>
              <span className="font-medium">{fd.tenure} days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start Date</span>
              <span className="font-medium">
                {fd.startDate ? formatDateTime(fd.startDate) : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Maturity Date</span>
              <span className="font-medium">
                {fd.maturityDate ? formatDateTime(fd.maturityDate) : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Interest Amount</span>
              <span className="font-medium">
                {formatCurrency(fd.interestAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Maturity Amount</span>
              <span className="font-medium">
                {formatCurrency(fd.maturityAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accrued Interest</span>
              <span className="font-medium">
                {formatCurrency(fd.accruedInterest)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Funding Mode</span>
              <span className="font-medium">{fd.fundingMode || '-'}</span>
            </div>
            {fd.fundingReference && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Funding Reference</span>
                <span className="font-medium">{fd.fundingReference}</span>
              </div>
            )}
            {fd.interestPayment && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Interest Payment</span>
                <span className="font-medium">
                  {fd.interestPayment.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {fd.maturityInstruction && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Maturity Instruction
                </span>
                <span className="font-medium">
                  {fd.maturityInstruction.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {fd.status === 'PREMATURE_CLOSED' && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Penalty Amount</span>
                  <span className="font-medium text-red-600">
                    {formatCurrency(fd.penaltyAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="font-medium">
                    {formatCurrency(fd.amountPaid)}
                  </span>
                </div>
                {fd.terminationReason && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Termination Reason
                    </span>
                    <span className="font-medium">{fd.terminationReason}</span>
                  </div>
                )}
                {fd.terminatedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Terminated At</span>
                    <span className="font-medium">
                      {formatDateTime(fd.terminatedAt)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customer Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Customer Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer Name</span>
              <span className="font-medium">
                {fd.customer?.firstName} {fd.customer?.lastName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer Number</span>
              <span className="font-medium">
                {fd.customer?.customerNumber}
              </span>
            </div>
            {fd.customer?.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{fd.customer.phone}</span>
              </div>
            )}
            {fd.customer?.email && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium">{fd.customer.email}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Interest Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Interest Payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period Start</TableHead>
                <TableHead>Period End</TableHead>
                <TableHead className="text-right">Interest Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!fd.interestPayments || fd.interestPayments.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground py-8"
                  >
                    No interest payments recorded
                  </TableCell>
                </TableRow>
              )}
              {fd.interestPayments?.map((ip: any) => (
                <TableRow key={ip.id}>
                  <TableCell>
                    {ip.periodStart ? formatDateTime(ip.periodStart) : '-'}
                  </TableCell>
                  <TableCell>
                    {ip.periodEnd ? formatDateTime(ip.periodEnd) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(ip.interestAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={paymentStatusVariant[ip.status] || 'default'}
                    >
                      {ip.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Maturity Liquidation Dialog */}
      <Dialog open={matureOpen} onOpenChange={setMatureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Liquidate at Maturity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confirm maturity payout for certificate{' '}
              <strong>{fd.certificateNumber}</strong>. The full maturity amount
              of <strong>{formatCurrency(fd.maturityAmount)}</strong> (principal{' '}
              {formatCurrency(fd.principalAmount)} + interest{' '}
              {formatCurrency(fd.interestAmount)}) will be paid out and the GL
              will be updated.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMatureOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleMature} disabled={isPending}>
              {isPending ? 'Processing...' : 'Confirm Liquidation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Premature Withdrawal Dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Premature Withdrawal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to proceed with a premature withdrawal for
              certificate <strong>{fd.certificateNumber}</strong>? A penalty of
              50% of earned interest will be applied.
            </p>
            <div className="space-y-2">
              <label
                htmlFor="withdraw-reason"
                className="text-sm font-medium leading-none"
              >
                Reason for withdrawal *
              </label>
              <Input
                id="withdraw-reason"
                placeholder="Enter reason for premature withdrawal"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWithdrawOpen(false);
                setWithdrawReason('');
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleWithdraw}
              disabled={isPending || !withdrawReason.trim()}
            >
              {isPending ? 'Processing...' : 'Confirm Withdrawal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
