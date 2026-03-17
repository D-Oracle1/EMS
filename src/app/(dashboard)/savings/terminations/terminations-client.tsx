'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, DollarSign, RefreshCw, Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  getTerminationRequests,
  decideTermination,
  processTerminationPayout,
} from '@/actions/fixed-savings.actions';
import type { SessionUser } from '@/types';

interface Props { user: SessionUser; }

const statusVariant: Record<string, any> = {
  PENDING: 'warning',
  APPROVED: 'default',
  REJECTED: 'destructive',
  PAID: 'success',
};

export function TerminationsClient({ user }: Props) {
  const [terminations, setTerminations] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [isPending, startTransition] = useTransition();

  // Review dialog
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [approvedInterest, setApprovedInterest] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const canApprove = user.permissions.includes('SAVINGS:APPROVE');

  function loadData(page = 1) {
    startTransition(async () => {
      try {
        const result = await getTerminationRequests({ status: statusFilter || undefined, page, limit: 20 });
        setTerminations(result.data);
        setPagination(result.pagination);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load terminations');
      }
    });
  }

  useEffect(() => { loadData(1); }, [statusFilter]);

  function openReview(t: any) {
    setSelected(t);
    setApprovedInterest(String(t.accruedInterest));
    // Pre-populate penalty from product default
    const defPenalty = t.account?.product?.defaultTerminationPenaltyRate;
    if (defPenalty) {
      const penAmt = (t.accruedInterest * defPenalty / 100).toFixed(2);
      setPenaltyAmount(penAmt);
    } else {
      setPenaltyAmount('0');
    }
    setNotes('');
    setRejectionReason('');
    setShowDetails(false);
    setReviewOpen(true);
  }

  const computedPayout = selected
    ? Math.max(0, parseFloat(selected.principalAmount || 0) + parseFloat(approvedInterest || '0') - parseFloat(penaltyAmount || '0'))
    : 0;

  async function handleDecision(decision: 'APPROVED' | 'REJECTED') {
    if (!selected) return;
    if (decision === 'REJECTED' && !rejectionReason.trim()) return toast.error('Enter rejection reason');
    setActionLoading(true);
    try {
      const result = await decideTermination({
        terminationId: selected.id,
        decision,
        approvedInterest: decision === 'APPROVED' ? parseFloat(approvedInterest) : undefined,
        penaltyAmount: decision === 'APPROVED' ? parseFloat(penaltyAmount || '0') : undefined,
        notes: notes || undefined,
        rejectionReason: rejectionReason || undefined,
      });
      if (result.success) {
        toast.success(result.message);
        setReviewOpen(false);
        loadData(pagination.page);
      } else {
        toast.error(result.error);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePayout(terminationId: string) {
    if (!confirm('Execute payout now? This action cannot be undone.')) return;
    setActionLoading(true);
    try {
      const result = await processTerminationPayout(terminationId);
      if (result.success) {
        toast.success(result.message);
        loadData(pagination.page);
      } else {
        toast.error(result.error);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Early Termination Requests</h1>
          <p className="text-muted-foreground">Review and approve fixed savings early termination requests</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/savings/accounts">All Accounts</Link>
          </Button>
          <Button variant="outline" onClick={() => loadData(1)} disabled={isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Requests</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Savings Plan</TableHead>
                  <TableHead className="text-right">Total Deposits</TableHead>
                  <TableHead className="text-right">Accrued Interest</TableHead>
                  <TableHead className="text-center">Months Completed</TableHead>
                  <TableHead>Maturity Date</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  {canApprove && <TableHead className="text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                )}
                {!isPending && terminations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No termination requests found
                    </TableCell>
                  </TableRow>
                )}
                {terminations.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm">{t.requestNumber}</TableCell>
                    <TableCell>
                      <p className="font-medium">{t.account.customer.firstName} {t.account.customer.lastName}</p>
                      <p className="text-xs text-muted-foreground">{t.account.customer.customerNumber}</p>
                      <Link href={`/savings/${t.accountId}`} className="text-xs text-primary hover:underline">
                        {t.account.accountNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{t.account.product.name}</p>
                      <p className="text-xs text-muted-foreground">{t.account.product.durationMonths} months</p>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(t.account.totalDeposits)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(t.accruedInterest)}</TableCell>
                    <TableCell className="text-center">{t.account.monthsCompleted}m</TableCell>
                    <TableCell className="text-sm">{t.account.maturityDate ? formatDate(t.account.maturityDate) : '—'}</TableCell>
                    <TableCell className="text-sm">{formatDate(t.requestDate)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={statusVariant[t.status] || 'default'}>{t.status}</Badge>
                    </TableCell>
                    {canApprove && (
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          {t.status === 'PENDING' && (
                            <Button size="sm" variant="outline" onClick={() => openReview(t)}>Review</Button>
                          )}
                          {t.status === 'APPROVED' && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handlePayout(t.id)}
                              disabled={actionLoading}
                            >
                              {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Pay Out'}
                            </Button>
                          )}
                          {(t.status === 'REJECTED' || t.status === 'PAID') && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {terminations.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-semibold">{t.account.customer.firstName} {t.account.customer.lastName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t.requestNumber}</p>
                    </div>
                    <Badge variant={statusVariant[t.status] || 'default'}>{t.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    <span className="text-muted-foreground">Plan:</span><span>{t.account.product.name}</span>
                    <span className="text-muted-foreground">Total Deposits:</span><span>{formatCurrency(t.account.totalDeposits)}</span>
                    <span className="text-muted-foreground">Accrued Interest:</span><span className="text-green-600">{formatCurrency(t.accruedInterest)}</span>
                    <span className="text-muted-foreground">Months Done:</span><span>{t.account.monthsCompleted}m</span>
                    <span className="text-muted-foreground">Maturity:</span><span>{t.account.maturityDate ? formatDate(t.account.maturityDate) : '—'}</span>
                  </div>
                  {canApprove && t.status === 'PENDING' && (
                    <Button size="sm" className="w-full" onClick={() => openReview(t)}>Review Request</Button>
                  )}
                  {canApprove && t.status === 'APPROVED' && (
                    <Button size="sm" className="w-full" onClick={() => handlePayout(t.id)} disabled={actionLoading}>
                      Execute Payout
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => loadData(pagination.page - 1)} disabled={pagination.page <= 1}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => loadData(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Review Termination Request</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 py-2">
              {/* Summary */}
              <div className="bg-muted rounded-md p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-medium">{selected.account.customer.firstName} {selected.account.customer.lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account:</span>
                  <span className="font-mono">{selected.account.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan:</span>
                  <span>{selected.account.product.name} ({selected.account.product.durationMonths} months)</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Deposits (Principal):</span>
                  <span className="font-semibold">{formatCurrency(selected.principalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Accrued Interest:</span>
                  <span className="text-green-600 font-semibold">{formatCurrency(selected.accruedInterest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Months Completed:</span>
                  <span>{selected.account.monthsCompleted} of {selected.account.product.durationMonths} months</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Maturity Date:</span>
                  <span>{selected.account.maturityDate ? formatDate(selected.account.maturityDate) : '—'}</span>
                </div>
              </div>

              <Separator />
              <p className="text-sm font-medium">Approval Terms</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Approved Interest (₦)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={approvedInterest}
                    onChange={(e) => setApprovedInterest(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Can be reduced from accrued amount</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Penalty (₦)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={penaltyAmount}
                    onChange={(e) => setPenaltyAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Amount deducted from payout</p>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-md p-3 text-sm">
                <div className="flex justify-between">
                  <span>Principal:</span>
                  <span>{formatCurrency(selected.principalAmount)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>+ Approved Interest:</span>
                  <span>+{formatCurrency(parseFloat(approvedInterest || '0'))}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>- Penalty:</span>
                  <span>-{formatCurrency(parseFloat(penaltyAmount || '0'))}</span>
                </div>
                <Separator className="my-1.5" />
                <div className="flex justify-between font-bold">
                  <span>Total Payout:</span>
                  <span>{formatCurrency(computedPayout)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Admin notes about this decision..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Rejection Reason (required if rejecting)</Label>
                <Input
                  placeholder="Reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => handleDecision('REJECTED')}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Reject
            </Button>
            <Button
              onClick={() => handleDecision('APPROVED')}
              disabled={actionLoading || computedPayout <= 0}
            >
              {actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
