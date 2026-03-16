'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  User,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { processDeposit, requestWithdrawal, processWithdrawalRequest } from '@/actions/savings.actions';
import type { SessionUser } from '@/types';

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'secondary'> = {
  ACTIVE: 'success',
  DORMANT: 'warning',
  FROZEN: 'error',
  CLOSED: 'secondary',
};

const txnTypeVariant: Record<string, 'success' | 'error' | 'info' | 'warning' | 'default'> = {
  DEPOSIT: 'success',
  WITHDRAWAL: 'error',
  INTEREST: 'info',
  FEE: 'warning',
  TRANSFER_IN: 'success',
  TRANSFER_OUT: 'error',
};

const wdrStatusVariant: Record<string, 'warning' | 'success' | 'error' | 'secondary'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  PROCESSED: 'secondary',
  CANCELLED: 'secondary',
};

interface SavingsDetailClientProps {
  user: SessionUser;
  account: any;
}

export function SavingsDetailClient({ user, account }: SavingsDetailClientProps) {
  const router = useRouter();
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const canDeposit = user.permissions.some((p) =>
    ['SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW'].includes(p)
  );
  const canWithdraw = user.permissions.includes('SAVINGS:WITHDRAW');
  const canApprove = user.permissions.includes('SAVINGS:APPROVE');

  const pendingRequests = account.withdrawalRequests?.filter(
    (wr: any) => wr.status === 'PENDING'
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/savings">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {account.accountNumber}
            </h1>
            <p className="text-muted-foreground">
              {account.product.name}
            </p>
          </div>
          <Badge variant={statusVariant[account.status] || 'default'}>
            {account.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {canDeposit && account.status === 'ACTIVE' && (
            <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
              <DialogTrigger asChild>
                <Button>
                  <ArrowDownCircle className="mr-2 h-4 w-4" />
                  Deposit
                </Button>
              </DialogTrigger>
              <DepositDialog
                accountId={account.id}
                onSuccess={() => {
                  setDepositOpen(false);
                  router.refresh();
                }}
              />
            </Dialog>
          )}
          {canWithdraw && account.status === 'ACTIVE' && (
            <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Withdraw
                </Button>
              </DialogTrigger>
              <WithdrawDialog
                accountId={account.id}
                availableBalance={account.availableBalance}
                maxDailyWithdrawal={account.product.maxDailyWithdrawal}
                onSuccess={() => {
                  setWithdrawOpen(false);
                  router.refresh();
                }}
              />
            </Dialog>
          )}
        </div>
      </div>

      {/* Account Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Balance</p>
                <p className="text-xl font-bold">{formatCurrency(account.currentBalance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-xl font-bold">{formatCurrency(account.availableBalance)}</p>
                {account.holdAmount > 0 && (
                  <p className="text-xs text-amber-600">
                    Hold: {formatCurrency(account.holdAmount)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Interest Accrued</p>
                <p className="text-xl font-bold">{formatCurrency(account.interestAccrued)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Withdrawal Requests */}
      {pendingRequests.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Pending Withdrawal Requests ({pendingRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingRequests.map((wr: any) => (
                <PendingWithdrawalCard
                  key={wr.id}
                  request={wr}
                  canApprove={canApprove}
                  currentUserId={user.id}
                  onAction={() => router.refresh()}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">
                {account.customer.firstName} {account.customer.lastName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer #</span>
              <span className="font-medium">{account.customer.customerNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product</span>
              <span className="font-medium">{account.product.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product Code</span>
              <span className="font-medium">{account.product.code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hold Amount</span>
              <span className="font-medium">{formatCurrency(account.holdAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily Withdrawal Limit</span>
              <span className="font-medium">
                {account.product.maxDailyWithdrawal
                  ? formatCurrency(account.product.maxDailyWithdrawal)
                  : 'No limit'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Opened</span>
              <span className="font-medium">
                {account.createdAt ? formatDateTime(account.createdAt) : '-'}
              </span>
            </div>
            {account.lastTransactionAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Transaction</span>
                <span className="font-medium">{formatDateTime(account.lastTransactionAt)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {(!account.transactions || account.transactions.length === 0) && (
              <p className="text-center text-muted-foreground py-8">No transactions yet</p>
            )}
            {account.transactions?.map((txn: any) => (
              <div key={txn.id} className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant={txnTypeVariant[txn.transactionType] || 'default'}>
                    {txn.transactionType}
                  </Badge>
                  <span className="font-medium">{formatCurrency(txn.amount)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{txn.narration || '-'}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{txn.transactionRef}</span>
                  <span>{txn.processedAt ? formatDateTime(txn.processedAt) : '-'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!account.transactions || account.transactions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No transactions yet
                    </TableCell>
                  </TableRow>
                )}
                {account.transactions?.map((txn: any) => (
                  <TableRow key={txn.id}>
                    <TableCell className="text-sm">
                      {txn.processedAt ? formatDateTime(txn.processedAt) : '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{txn.transactionRef}</TableCell>
                    <TableCell>
                      <Badge variant={txnTypeVariant[txn.transactionType] || 'default'}>
                        {txn.transactionType}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {txn.narration || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(txn.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(txn.balanceAfter)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Pending Withdrawal Request Card ─────────────────────────────── */

function PendingWithdrawalCard({
  request,
  canApprove,
  currentUserId,
  onAction,
}: {
  request: any;
  canApprove: boolean;
  currentUserId: string;
  onAction: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const isOwnRequest = request.requestedById === currentUserId;

  const handleApprove = () => {
    startTransition(async () => {
      const result = await processWithdrawalRequest({
        requestId: request.id,
        decision: 'APPROVED',
      });
      if (result.success) {
        toast.success(result.message);
        onAction();
      } else {
        toast.error(result.error || 'Failed to approve');
      }
    });
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    startTransition(async () => {
      const result = await processWithdrawalRequest({
        requestId: request.id,
        decision: 'REJECTED',
        rejectionReason,
      });
      if (result.success) {
        toast.success(result.message);
        onAction();
      } else {
        toast.error(result.error || 'Failed to reject');
      }
    });
  };

  return (
    <div className="border rounded-lg p-4 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{request.requestNumber}</p>
          <p className="text-sm text-muted-foreground">
            Requested by {request.requestedBy.firstName} {request.requestedBy.lastName}
            {' '}on {formatDateTime(request.requestedAt)}
          </p>
        </div>
        <span className="text-lg font-bold text-amber-700">
          {formatCurrency(request.amount)}
        </span>
      </div>
      {request.reason && (
        <p className="text-sm">Reason: {request.reason}</p>
      )}
      <div className="text-xs text-muted-foreground">
        Payment: {request.paymentMode}
        {request.paymentReference && ` | Ref: ${request.paymentReference}`}
      </div>

      {canApprove && !isOwnRequest && (
        <>
          <Separator />
          {!showReject ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isPending}
              >
                <CheckCircle className="mr-1 h-4 w-4" />
                {isPending ? 'Processing...' : 'Approve & Process'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowReject(true)}
                disabled={isPending}
              >
                <XCircle className="mr-1 h-4 w-4" />
                Reject
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                placeholder="Why is this withdrawal being rejected?"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isPending || !rejectionReason.trim()}
                >
                  {isPending ? 'Rejecting...' : 'Confirm Rejection'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowReject(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {canApprove && isOwnRequest && (
        <p className="text-xs text-amber-600 italic">
          You cannot approve your own withdrawal request (segregation of duties).
        </p>
      )}
    </div>
  );
}

/* ─── Deposit Dialog ──────────────────────────────────────────────── */

function DepositDialog({
  accountId,
  onSuccess,
}: {
  accountId: string;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [narration, setNarration] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    startTransition(async () => {
      const result = await processDeposit({
        accountId,
        amount: numAmount,
        paymentMode,
        paymentReference: paymentReference || undefined,
        narration: narration || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        onSuccess();
      } else {
        toast.error(result.error || 'Deposit failed');
      }
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Process Deposit</DialogTitle>
        <DialogDescription>
          Enter the deposit details below.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="dep-amount">Amount</Label>
          <Input
            id="dep-amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dep-mode">Payment Mode</Label>
          <Select value={paymentMode} onValueChange={setPaymentMode}>
            <SelectTrigger id="dep-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="CHEQUE">Cheque</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dep-ref">Payment Reference (optional)</Label>
          <Input
            id="dep-ref"
            placeholder="Reference number"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dep-narration">Narration (optional)</Label>
          <Input
            id="dep-narration"
            placeholder="Description"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Processing...' : 'Process Deposit'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* ─── Withdrawal Dialog (uses requestWithdrawal) ──────────────────── */

function WithdrawDialog({
  accountId,
  availableBalance,
  maxDailyWithdrawal,
  onSuccess,
}: {
  accountId: string;
  availableBalance: number;
  maxDailyWithdrawal: number | null;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  const numAmount = parseFloat(amount) || 0;
  const needsApproval = maxDailyWithdrawal !== null && numAmount > maxDailyWithdrawal;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (numAmount > availableBalance) {
      toast.error('Amount exceeds available balance');
      return;
    }

    startTransition(async () => {
      const result = await requestWithdrawal({
        accountId,
        amount: numAmount,
        paymentMode,
        paymentReference: paymentReference || undefined,
        reason: reason || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        onSuccess();
      } else {
        toast.error(result.error || 'Withdrawal failed');
      }
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Process Withdrawal</DialogTitle>
        <DialogDescription>
          Available balance: {formatCurrency(availableBalance)}
          {maxDailyWithdrawal !== null && (
            <span className="block text-xs mt-1">
              Daily limit: {formatCurrency(maxDailyWithdrawal)} — amounts over this require manager approval
            </span>
          )}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wd-amount">Amount</Label>
          <Input
            id="wd-amount"
            type="number"
            step="0.01"
            min="0"
            max={availableBalance}
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          {needsApproval && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              This amount exceeds the daily limit. It will be submitted for approval.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="wd-mode">Payment Mode</Label>
          <Select value={paymentMode} onValueChange={setPaymentMode}>
            <SelectTrigger id="wd-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="CHEQUE">Cheque</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wd-ref">Payment Reference (optional)</Label>
          <Input
            id="wd-ref"
            placeholder="Reference number"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
          />
        </div>
        {needsApproval && (
          <div className="space-y-2">
            <Label htmlFor="wd-reason">Reason for Withdrawal</Label>
            <Textarea
              id="wd-reason"
              placeholder="Explain the reason for this large withdrawal..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        )}
        <DialogFooter>
          <Button type="submit" disabled={isPending} variant={needsApproval ? 'default' : 'destructive'}>
            {isPending
              ? 'Processing...'
              : needsApproval
                ? 'Submit for Approval'
                : 'Process Withdrawal'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
