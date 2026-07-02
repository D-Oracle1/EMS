'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  Banknote,
  ClipboardCheck,
  ShieldCheck,
  Wallet,
  AlertTriangle,
  Calendar,
  User,
  FileText,
  Clock,
  CreditCard,
  Lock,
  RefreshCcw,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  submitForVerification,
  submitVerification,
  submitForApproval,
  processApproval,
  disburseLoan,
  processRepayment,
  getVerificationOfficers,
  requestRestructuring,
  processRestructuring,
  applyRestructuring,
  writeOffLoan,
} from '@/actions/loan.actions';
import type { SessionUser } from '@/types';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type LoanStatusKey =
  | 'DRAFT'
  | 'PENDING_VERIFICATION'
  | 'VERIFICATION_IN_PROGRESS'
  | 'VERIFIED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PENDING_DISBURSEMENT'
  | 'REJECTED'
  | 'ACTIVE'
  | 'OVERDUE'
  | 'DEFAULTED'
  | 'CLOSED'
  | 'WRITTEN_OFF';

const STATUS_CONFIG: Record<
  LoanStatusKey,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'error' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  PENDING_VERIFICATION: { label: 'Pending Verification', variant: 'warning' },
  VERIFICATION_IN_PROGRESS: { label: 'Verification In Progress', variant: 'warning' },
  VERIFIED: { label: 'Verified', variant: 'info' },
  PENDING_APPROVAL: { label: 'Pending Approval', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'info' },
  PENDING_DISBURSEMENT: { label: 'Pending Disbursement', variant: 'info' },
  REJECTED: { label: 'Rejected', variant: 'error' },
  ACTIVE: { label: 'Active', variant: 'success' },
  OVERDUE: { label: 'Overdue', variant: 'destructive' },
  DEFAULTED: { label: 'Defaulted', variant: 'error' },
  CLOSED: { label: 'Closed', variant: 'outline' },
  WRITTEN_OFF: { label: 'Written Off', variant: 'error' },
};

type ScheduleStatusKey = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED';

const SCHEDULE_STATUS_COLORS: Record<ScheduleStatusKey, string> = {
  PENDING: 'text-muted-foreground',
  PARTIAL: 'text-yellow-600 bg-yellow-50',
  PAID: 'text-green-600 bg-green-50',
  OVERDUE: 'text-red-600 bg-red-50',
  WAIVED: 'text-slate-400',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoanData {
  id: string;
  loanNumber: string;
  principalAmount: number;
  interestRate: number;
  tenure: number;
  processingFee: number;
  insuranceFee: number;
  totalFees: number;
  totalInterest: number;
  totalRepayment: number;
  monthlyInstalment: number;
  purpose: string | null;
  collateralDetails: string | null;
  guarantorDetails: string | null;
  status: string;
  applicationDate: Date | string;
  approvedAt: Date | string | null;
  disbursedAt: Date | string | null;
  firstRepaymentDate: Date | string | null;
  maturityDate: Date | string | null;
  closedAt: Date | string | null;
  createdAt: Date | string;
  createdById: string;
  customer: {
    id: string;
    customerNumber: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
    address: string | null;
    monthlyIncome: number;
    [key: string]: unknown;
  };
  product: {
    id: string;
    code: string;
    name: string;
    interestType: string;
    [key: string]: unknown;
  };
  createdBy: {
    firstName: string;
    lastName: string;
    employeeId: string;
  };
  verificationOfficer: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
  } | null;
  schedule: Array<{
    id: string;
    installmentNumber: number;
    dueDate: Date | string;
    principalDue: number;
    interestDue: number;
    totalDue: number;
    principalPaid: number;
    interestPaid: number;
    totalPaid: number;
    outstandingBalance: number;
    status: string;
    paidDate: Date | string | null;
  }>;
  repayments: Array<{
    id: string;
    receiptNumber: string;
    amount: number;
    principalPortion: number;
    interestPortion: number;
    paymentMode: string;
    paymentReference: string | null;
    collectedAt: Date | string;
    notes: string | null;
  }>;
  guarantors: Array<{
    id: string;
    title: string | null;
    firstName: string;
    lastName: string;
    middleName: string | null;
    relationship: string | null;
    phone: string;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    occupation: string | null;
    employer: string | null;
    monthlyIncome: number | null;
    bvn: string | null;
    nationalId: string | null;
  }>;
  verifications: Array<{
    id: string;
    verificationType: string;
    addressVerified: boolean | null;
    addressComments: string | null;
    employmentVerified: boolean | null;
    employmentComments: string | null;
    riskLevel: string | null;
    recommendation: string | null;
    findings: string | null;
    status: string;
    submittedAt?: Date | string | null;
    estimatedValue: number;
    officer: { firstName: string; lastName: string };
  }>;
  approvals: Array<{
    id: string;
    level: number;
    decision: string;
    comments: string | null;
    conditions: string | null;
    approvedAmount: number;
    createdAt: Date | string;
    approver: {
      firstName: string;
      lastName: string;
      role: { name: string };
    };
  }>;
  disbursement: {
    id: string;
    disbursedAmount: number | { toNumber?: () => number };
    disbursementMode: string;
    bankName: string | null;
    accountNumber: string | null;
    accountName: string | null;
    chequeNumber: string | null;
    reference: string | null;
    notes: string | null;
    disbursedAt: Date | string;
    disbursedBy: { firstName: string; lastName: string };
    [key: string]: unknown;
  } | null;
  restructurings?: Array<{
    id: string;
    restructuringNumber: string;
    restructuringType: string;
    previousTenure: number;
    previousOutstandingBalance: { toNumber?: () => number } | number;
    newTenure: number | null;
    newInterestRate: { toNumber?: () => number } | number | null;
    writeOffAmount: { toNumber?: () => number } | number | null;
    effectiveBalance: { toNumber?: () => number } | number;
    reason: string;
    status: string;
    createdAt: Date | string;
    approvedAt: Date | string | null;
    requestedBy: { firstName: string; lastName: string };
    approvedBy: { firstName: string; lastName: string } | null;
  }>;
}

interface LoanDetailClientProps {
  loan: LoanData;
  user: SessionUser;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoanDetailClient({ loan, user }: LoanDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalDecision, setApprovalDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [disbursementOpen, setDisbursementOpen] = useState(false);
  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [restructuringOpen, setRestructuringOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  // Verification officer assignment dialog state
  const [assignOfficerOpen, setAssignOfficerOpen] = useState(false);
  const [verificationOfficers, setVerificationOfficers] = useState<Array<{ id: string; firstName: string; lastName: string; employeeId: string }>>([]);
  const [selectedOfficerId, setSelectedOfficerId] = useState('');

  const statusConf = STATUS_CONFIG[loan.status as LoanStatusKey] || {
    label: loan.status,
    variant: 'outline' as const,
  };
  const hasPerm = (p: string) => user.permissions.includes(p);
  const hasAnyPerm = (ps: string[]) => ps.some((p) => user.permissions.includes(p));

  // ------ Action handlers ------

  async function handleOpenAssignOfficer() {
    const officers = await getVerificationOfficers();
    setVerificationOfficers(officers);
    setSelectedOfficerId('');
    setAssignOfficerOpen(true);
  }

  async function handleSubmitForVerification(officerId: string) {
    startTransition(async () => {
      const result = await submitForVerification(loan.id, officerId);
      if (result.success) {
        toast.success(result.message);
        setAssignOfficerOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to submit for verification');
      }
    });
  }

  async function handleSubmitForApproval() {
    startTransition(async () => {
      const result = await submitForApproval(loan.id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to submit for approval');
      }
    });
  }

  // ------ Render helpers ------

  function renderInfoRow(label: string, value: React.ReactNode) {
    return (
      <div className="flex justify-between py-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-right">{value}</span>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // MAIN RENDER
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Back link + Header */}
      <div className="flex items-center gap-4">
        <Link href="/loans">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Loans
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{loan.loanNumber}</h1>
            <Badge variant={statusConf.variant} className="text-sm">
              {statusConf.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {loan.customer.firstName} {loan.customer.lastName} &middot; {loan.product.name}
          </p>
        </div>

        {/* STATE MACHINE ACTION BUTTONS */}
        <div className="flex flex-wrap gap-2">
          {/* Submit Verification: VERIFICATION_IN_PROGRESS + assigned officer */}
          {(loan.status === 'PENDING_VERIFICATION' || loan.status === 'VERIFICATION_IN_PROGRESS') &&
            loan.verificationOfficer?.id === user.id &&
            hasPerm('LOANS:VERIFY') && (
              <Button
                onClick={() => setVerificationOpen(true)}
                disabled={isPending}
                variant="default"
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Submit Verification
              </Button>
            )}

          {/* Submit for Verification: DRAFT + LOANS:CREATE */}
          {loan.status === 'DRAFT' && hasPerm('LOANS:CREATE') && (
            <Button
              onClick={handleOpenAssignOfficer}
              disabled={isPending}
              variant="default"
            >
              <Send className="h-4 w-4 mr-2" />
              Submit for Verification
            </Button>
          )}

          {/* Submit for Approval: VERIFIED + LOANS:CREATE */}
          {loan.status === 'VERIFIED' && hasPerm('LOANS:CREATE') && (
            <Button
              onClick={handleSubmitForApproval}
              disabled={isPending}
              variant="default"
            >
              <Send className="h-4 w-4 mr-2" />
              Submit for Approval
            </Button>
          )}

          {/* Approve / Reject: PENDING_APPROVAL + LOANS:APPROVE_L1 or LOANS:APPROVE_L2 + not the loan creator */}
          {loan.status === 'PENDING_APPROVAL' &&
            hasAnyPerm(['LOANS:APPROVE_L1', 'LOANS:APPROVE_L2']) &&
            loan.createdById !== user.id && (
              <>
                <Button
                  onClick={() => {
                    setApprovalDecision('APPROVED');
                    setApprovalOpen(true);
                  }}
                  disabled={isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  onClick={() => {
                    setApprovalDecision('REJECTED');
                    setApprovalOpen(true);
                  }}
                  disabled={isPending}
                  variant="destructive"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </>
            )}

          {/* Disburse: PENDING_DISBURSEMENT or APPROVED + LOANS:DISBURSE */}
          {(loan.status === 'PENDING_DISBURSEMENT' || loan.status === 'APPROVED') && hasPerm('LOANS:DISBURSE') && (
            <Button
              onClick={() => setDisbursementOpen(true)}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Banknote className="h-4 w-4 mr-2" />
              Disburse
            </Button>
          )}

          {/* Record Payment: ACTIVE/OVERDUE + LOANS:COLLECT */}
          {(loan.status === 'ACTIVE' || loan.status === 'OVERDUE') &&
            hasPerm('LOANS:COLLECT') && (
              <Button
                onClick={() => setRepaymentOpen(true)}
                disabled={isPending}
                variant="default"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
            )}

          {/* Restructure: ACTIVE/OVERDUE + LOANS:CREATE or APPROVE */}
          {(loan.status === 'ACTIVE' || loan.status === 'OVERDUE') &&
            hasAnyPerm(['LOANS:CREATE', 'LOANS:APPROVE_L1']) && (
              <Button
                onClick={() => setRestructuringOpen(true)}
                disabled={isPending}
                variant="outline"
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Restructure
              </Button>
            )}

          {/* Write Off: DEFAULTED/OVERDUE + LOANS:APPROVE_L2 (Director only) */}
          {(loan.status === 'DEFAULTED' || loan.status === 'OVERDUE') &&
            hasPerm('LOANS:APPROVE_L2') && (
              <Button
                onClick={() => setWriteOffOpen(true)}
                disabled={isPending}
                variant="destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Write Off
              </Button>
            )}
        </div>
      </div>

      {/* Verification Lock Banner */}
      {(loan.status === 'PENDING_VERIFICATION' || loan.status === 'VERIFICATION_IN_PROGRESS') && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Lock className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-800">Loan Locked for Verification</p>
            <p className="text-amber-700">
              This loan application is locked while verification is in progress.
              {loan.verificationOfficer && (
                <> Assigned to {loan.verificationOfficer.firstName} {loan.verificationOfficer.lastName} ({loan.verificationOfficer.employeeId}).</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* LOAN INFO + CUSTOMER INFO CARDS                                   */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Loan Information */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Loan Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            {renderInfoRow('Principal Amount', formatCurrency(loan.principalAmount))}
            {renderInfoRow('Interest Rate', `${loan.interestRate}% p.a.`)}
            {renderInfoRow('Interest Type', loan.product.interestType.replace(/_/g, ' '))}
            {renderInfoRow('Tenure', `${loan.tenure} months`)}
            {renderInfoRow('Monthly Instalment', formatCurrency(loan.monthlyInstalment))}
            {renderInfoRow('Total Interest', formatCurrency(loan.totalInterest))}
            {renderInfoRow('Total Repayment', formatCurrency(loan.totalRepayment))}
            <Separator />
            {renderInfoRow('Processing Fee', formatCurrency(loan.processingFee))}
            {renderInfoRow('Insurance Fee', formatCurrency(loan.insuranceFee))}
            {renderInfoRow('Total Fees', formatCurrency(loan.totalFees))}
            <Separator />
            {loan.purpose && renderInfoRow('Purpose', loan.purpose)}
            {loan.collateralDetails && renderInfoRow('Collateral', loan.collateralDetails)}
            {loan.guarantorDetails && renderInfoRow('Guarantor', loan.guarantorDetails)}
          </CardContent>
        </Card>

        {/* Customer + Dates */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y">
              {renderInfoRow('Name', `${loan.customer.firstName} ${loan.customer.lastName}`)}
              {renderInfoRow('Customer #', loan.customer.customerNumber)}
              {loan.customer.phone && renderInfoRow('Phone', loan.customer.phone)}
              {loan.customer.email && renderInfoRow('Email', loan.customer.email)}
              {loan.customer.monthlyIncome > 0 &&
                renderInfoRow('Monthly Income', formatCurrency(loan.customer.monthlyIncome))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Key Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 divide-y">
              {renderInfoRow('Application', formatDate(loan.applicationDate))}
              {loan.approvedAt && renderInfoRow('Approved', formatDate(loan.approvedAt))}
              {loan.disbursedAt && renderInfoRow('Disbursed', formatDate(loan.disbursedAt))}
              {loan.firstRepaymentDate &&
                renderInfoRow('First Repayment', formatDate(loan.firstRepaymentDate))}
              {loan.maturityDate && renderInfoRow('Maturity', formatDate(loan.maturityDate))}
              {loan.closedAt && renderInfoRow('Closed', formatDate(loan.closedAt))}
              {renderInfoRow(
                'Created By',
                `${loan.createdBy.firstName} ${loan.createdBy.lastName}`
              )}
              {loan.verificationOfficer && renderInfoRow(
                'Verification Officer',
                `${loan.verificationOfficer.firstName} ${loan.verificationOfficer.lastName}`
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* GUARANTORS                                                        */}
      {/* ----------------------------------------------------------------- */}
      {loan.guarantors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Guarantors
            </CardTitle>
            <CardDescription>
              {loan.guarantors.length} guarantor{loan.guarantors.length !== 1 ? 's' : ''} on this loan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loan.guarantors.map((g, i) => (
                <div key={g.id} className="rounded-lg border bg-muted/20 p-4 space-y-0 divide-y">
                  <div className="pb-2 mb-1">
                    <p className="font-medium">
                      {[g.title, g.firstName, g.middleName, g.lastName].filter(Boolean).join(' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">Guarantor {i + 1}</p>
                  </div>
                  {g.relationship && renderInfoRow('Relationship', g.relationship)}
                  {renderInfoRow('Phone', g.phone)}
                  {g.email && renderInfoRow('Email', g.email)}
                  {g.address && renderInfoRow('Address', [g.address, g.city, g.state].filter(Boolean).join(', '))}
                  {g.occupation && renderInfoRow('Occupation', g.occupation)}
                  {g.employer && renderInfoRow('Employer', g.employer)}
                  {g.monthlyIncome != null && g.monthlyIncome > 0 &&
                    renderInfoRow('Monthly Income', formatCurrency(g.monthlyIncome))}
                  {g.bvn && renderInfoRow('BVN', g.bvn)}
                  {g.nationalId && renderInfoRow('National ID', g.nationalId)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* REPAYMENT SCHEDULE                                                */}
      {/* ----------------------------------------------------------------- */}
      {loan.schedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Repayment Schedule
            </CardTitle>
            <CardDescription>
              {loan.schedule.filter((s) => s.status === 'PAID').length} of{' '}
              {loan.schedule.length} instalments paid
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loan.schedule.map((s) => {
                  const schedColor =
                    SCHEDULE_STATUS_COLORS[s.status as ScheduleStatusKey] || '';
                  return (
                    <TableRow key={s.id} className={schedColor}>
                      <TableCell className="font-mono">{s.installmentNumber}</TableCell>
                      <TableCell>{formatDate(s.dueDate)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(s.principalDue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(s.interestDue)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(s.totalDue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(s.totalPaid)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(s.outstandingBalance)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            s.status === 'PAID'
                              ? 'success'
                              : s.status === 'OVERDUE'
                              ? 'destructive'
                              : s.status === 'PARTIAL'
                              ? 'warning'
                              : 'secondary'
                          }
                        >
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* REPAYMENTS TABLE                                                  */}
      {/* ----------------------------------------------------------------- */}
      {loan.repayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Repayments
            </CardTitle>
            <CardDescription>
              {loan.repayments.length} payment{loan.repayments.length !== 1 ? 's' : ''}{' '}
              received &middot; Total:{' '}
              {formatCurrency(
                loan.repayments.reduce((sum, r) => sum + r.amount, 0)
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loan.repayments.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.receiptNumber}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(r.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(r.principalPortion)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(r.interestPortion)}
                    </TableCell>
                    <TableCell>{r.paymentMode.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.paymentReference || '-'}
                    </TableCell>
                    <TableCell>{formatDate(r.collectedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* VERIFICATIONS                                                     */}
      {/* ----------------------------------------------------------------- */}
      {loan.verifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Verifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loan.verifications.map((v) => (
              <div
                key={v.id}
                className="border rounded-lg p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{v.verificationType.replace(/_/g, ' ')}</Badge>
                    <Badge
                      variant={
                        v.recommendation === 'APPROVE'
                          ? 'success'
                          : v.recommendation === 'DECLINE'
                          ? 'error'
                          : 'warning'
                      }
                    >
                      {v.recommendation}
                    </Badge>
                    {v.riskLevel && (
                      <Badge
                        variant={
                          v.riskLevel === 'HIGH'
                            ? 'destructive'
                            : v.riskLevel === 'MEDIUM'
                            ? 'warning'
                            : 'success'
                        }
                      >
                        Risk: {v.riskLevel}
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {v.officer.firstName} {v.officer.lastName}
                    {v.submittedAt && ` - ${formatDate(v.submittedAt)}`}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {v.addressVerified !== null && (
                    <div className="flex items-center gap-1">
                      {v.addressVerified ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                      )}
                      <span>Address {v.addressVerified ? 'Verified' : 'Not Verified'}</span>
                    </div>
                  )}
                  {v.employmentVerified !== null && (
                    <div className="flex items-center gap-1">
                      {v.employmentVerified ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                      )}
                      <span>
                        Employment {v.employmentVerified ? 'Verified' : 'Not Verified'}
                      </span>
                    </div>
                  )}
                </div>
                {v.findings && (
                  <p className="text-sm text-muted-foreground">{v.findings}</p>
                )}
                {v.addressComments && (
                  <p className="text-xs text-muted-foreground">
                    Address: {v.addressComments}
                  </p>
                )}
                {v.employmentComments && (
                  <p className="text-xs text-muted-foreground">
                    Employment: {v.employmentComments}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* APPROVALS                                                         */}
      {/* ----------------------------------------------------------------- */}
      {loan.approvals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loan.approvals.map((a) => (
              <div key={a.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={a.decision === 'APPROVED' ? 'success' : 'error'}>
                      {a.decision}
                    </Badge>
                    <Badge variant="outline">Level {a.level}</Badge>
                    <span className="text-sm font-medium">
                      {a.approver.firstName} {a.approver.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({a.approver.role.name})
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(a.createdAt)}
                  </span>
                </div>
                {a.approvedAmount > 0 && (
                  <p className="text-sm">
                    Approved Amount: <span className="font-medium">{formatCurrency(a.approvedAmount)}</span>
                  </p>
                )}
                {a.comments && (
                  <p className="text-sm text-muted-foreground">{a.comments}</p>
                )}
                {a.conditions && (
                  <p className="text-sm text-muted-foreground">
                    Conditions: {a.conditions}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* DISBURSEMENT INFO                                                 */}
      {/* ----------------------------------------------------------------- */}
      {loan.disbursement && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Disbursement Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            {renderInfoRow(
              'Disbursed Amount',
              formatCurrency(
                typeof loan.disbursement.disbursedAmount === 'object' &&
                loan.disbursement.disbursedAmount?.toNumber
                  ? loan.disbursement.disbursedAmount.toNumber()
                  : (loan.disbursement.disbursedAmount as number)
              )
            )}
            {renderInfoRow(
              'Mode',
              loan.disbursement.disbursementMode.replace(/_/g, ' ')
            )}
            {loan.disbursement.bankName &&
              renderInfoRow('Bank', loan.disbursement.bankName)}
            {loan.disbursement.accountNumber &&
              renderInfoRow('Account #', loan.disbursement.accountNumber)}
            {loan.disbursement.accountName &&
              renderInfoRow('Account Name', loan.disbursement.accountName)}
            {loan.disbursement.chequeNumber &&
              renderInfoRow('Cheque #', loan.disbursement.chequeNumber)}
            {loan.disbursement.reference &&
              renderInfoRow('Reference', loan.disbursement.reference)}
            {loan.disbursement.notes &&
              renderInfoRow('Notes', loan.disbursement.notes)}
            {renderInfoRow(
              'Disbursed By',
              `${loan.disbursement.disbursedBy.firstName} ${loan.disbursement.disbursedBy.lastName}`
            )}
            {renderInfoRow('Date', formatDate(loan.disbursement.disbursedAt))}
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* RESTRUCTURINGS                                                   */}
      {/* ----------------------------------------------------------------- */}
      {loan.restructurings && loan.restructurings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCcw className="h-5 w-5" />
              Restructuring History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loan.restructurings.map((r) => {
              const toNum = (v: any) => (typeof v === 'object' && v?.toNumber ? v.toNumber() : Number(v || 0));
              return (
                <div key={r.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{r.restructuringNumber}</span>
                      <Badge variant={
                        r.status === 'APPLIED' ? 'success'
                          : r.status === 'APPROVED' ? 'info'
                          : r.status === 'REJECTED' ? 'error'
                          : r.status === 'PENDING' ? 'warning'
                          : 'secondary'
                      }>
                        {r.status}
                      </Badge>
                      <Badge variant="outline">{r.restructuringType.replace(/_/g, ' ')}</Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.reason}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {r.newTenure && (
                      <p>New Tenure: <span className="font-medium">{r.newTenure} months</span></p>
                    )}
                    {r.newInterestRate && (
                      <p>New Rate: <span className="font-medium">{toNum(r.newInterestRate)}%</span></p>
                    )}
                    {r.writeOffAmount && toNum(r.writeOffAmount) > 0 && (
                      <p>Write-off: <span className="font-medium">{formatCurrency(toNum(r.writeOffAmount))}</span></p>
                    )}
                    <p>Effective Balance: <span className="font-medium">{formatCurrency(toNum(r.effectiveBalance))}</span></p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Requested by: {r.requestedBy.firstName} {r.requestedBy.lastName}
                    {r.approvedBy && <> &middot; {r.status === 'REJECTED' ? 'Rejected' : 'Approved'} by: {r.approvedBy.firstName} {r.approvedBy.lastName}</>}
                  </p>
                  {/* Action buttons for pending restructurings */}
                  {r.status === 'PENDING' && hasAnyPerm(['LOANS:APPROVE_L1', 'LOANS:APPROVE_L2']) && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={isPending}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await processRestructuring({ restructuringId: r.id, decision: 'APPROVED', comments: 'Approved' });
                            if (result.success) { toast.success(result.message); router.refresh(); }
                            else toast.error(result.error || 'Failed');
                          });
                        }}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await processRestructuring({ restructuringId: r.id, decision: 'REJECTED', comments: 'Rejected' });
                            if (result.success) { toast.success(result.message); router.refresh(); }
                            else toast.error(result.error || 'Failed');
                          });
                        }}
                      >
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                  {/* Apply button for approved restructurings */}
                  {r.status === 'APPROVED' && hasAnyPerm(['LOANS:CREATE', 'LOANS:APPROVE_L1']) && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await applyRestructuring(r.id);
                            if (result.success) { toast.success(result.message); router.refresh(); }
                            else toast.error(result.error || 'Failed');
                          });
                        }}
                      >
                        <RefreshCcw className="h-3 w-3 mr-1" /> Apply Restructuring
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* DIALOGS                                                           */}
      {/* ================================================================= */}

      {/* Assign Verification Officer Dialog */}
      <Dialog open={assignOfficerOpen} onOpenChange={setAssignOfficerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Verification Officer</DialogTitle>
            <DialogDescription>
              Select the officer who will verify this loan application.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="officer-select">Verification Officer</Label>
            <Select value={selectedOfficerId} onValueChange={setSelectedOfficerId}>
              <SelectTrigger id="officer-select" className="mt-2">
                <SelectValue placeholder="Select verification officer" />
              </SelectTrigger>
              <SelectContent>
                {verificationOfficers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.firstName} {o.lastName} ({o.employeeId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOfficerOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selectedOfficerId || isPending}
              onClick={() => handleSubmitForVerification(selectedOfficerId)}
            >
              <Send className="h-4 w-4 mr-2" />
              {isPending ? 'Submitting...' : 'Assign & Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Dialog */}
      <VerificationDialog
        open={verificationOpen}
        onOpenChange={setVerificationOpen}
        loanId={loan.id}
        onComplete={() => {
          router.refresh();
        }}
      />

      {/* Approval Dialog */}
      <ApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        loanId={loan.id}
        decision={approvalDecision}
        principalAmount={loan.principalAmount}
        onComplete={() => {
          router.refresh();
        }}
      />

      {/* Disbursement Dialog */}
      <DisbursementDialog
        open={disbursementOpen}
        onOpenChange={setDisbursementOpen}
        loanId={loan.id}
        principalAmount={loan.principalAmount}
        approvedAmount={
          loan.approvals.find((a) => a.decision === 'APPROVED')?.approvedAmount || loan.principalAmount
        }
        onComplete={() => {
          router.refresh();
        }}
      />

      {/* Repayment Dialog */}
      <RepaymentDialog
        open={repaymentOpen}
        onOpenChange={setRepaymentOpen}
        loanId={loan.id}
        monthlyInstalment={loan.monthlyInstalment}
        onComplete={() => {
          router.refresh();
        }}
      />

      {/* Restructuring Dialog */}
      <RestructuringDialog
        open={restructuringOpen}
        onOpenChange={setRestructuringOpen}
        loanId={loan.id}
        currentTenure={loan.tenure}
        currentRate={loan.interestRate}
        onComplete={() => {
          router.refresh();
        }}
      />

      {/* Write-Off Dialog */}
      <WriteOffDialog
        open={writeOffOpen}
        onOpenChange={setWriteOffOpen}
        loanId={loan.id}
        loanNumber={loan.loanNumber}
        onComplete={() => {
          router.refresh();
        }}
      />
    </div>
  );
}

// ===========================================================================
// VERIFICATION DIALOG
// ===========================================================================

function VerificationDialog({
  open,
  onOpenChange,
  loanId,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loanId: string;
  onComplete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    verificationType: 'FIELD_VISIT',
    addressVerified: true,
    addressComments: '',
    employmentVerified: true,
    employmentComments: '',
    riskLevel: 'LOW',
    recommendation: 'APPROVE',
    findings: '',
    gpsCoordinates: '',
  });

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submitVerification({
        loanId,
        verificationType: form.verificationType,
        addressVerified: form.addressVerified,
        addressComments: form.addressComments || undefined,
        employmentVerified: form.employmentVerified,
        employmentComments: form.employmentComments || undefined,
        riskLevel: form.riskLevel,
        recommendation: form.recommendation,
        findings: form.findings || undefined,
        gpsCoordinates: form.gpsCoordinates || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        onComplete();
      } else {
        toast.error(result.error || 'Verification failed');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Verification</DialogTitle>
          <DialogDescription>
            Complete the verification assessment for this loan application.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Verification Type */}
          <div className="space-y-2">
            <Label>Verification Type</Label>
            <Select
              value={form.verificationType}
              onValueChange={(v) => update('verificationType', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIELD_VISIT">Field Visit</SelectItem>
                <SelectItem value="DOCUMENT_CHECK">Document Check</SelectItem>
                <SelectItem value="PHONE_VERIFICATION">Phone Verification</SelectItem>
                <SelectItem value="REFERENCE_CHECK">Reference Check</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Address Verification */}
          <div className="space-y-2">
            <Label>Address Verified</Label>
            <Select
              value={form.addressVerified ? 'true' : 'false'}
              onValueChange={(v) => update('addressVerified', v === 'true')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Address Comments</Label>
            <textarea
              value={form.addressComments}
              onChange={(e) => update('addressComments', e.target.value)}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Optional comments about address verification..."
            />
          </div>

          {/* Employment Verification */}
          <div className="space-y-2">
            <Label>Employment Verified</Label>
            <Select
              value={form.employmentVerified ? 'true' : 'false'}
              onValueChange={(v) => update('employmentVerified', v === 'true')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Employment Comments</Label>
            <textarea
              value={form.employmentComments}
              onChange={(e) => update('employmentComments', e.target.value)}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Optional comments about employment verification..."
            />
          </div>

          {/* Risk Level */}
          <div className="space-y-2">
            <Label>Risk Level</Label>
            <Select
              value={form.riskLevel}
              onValueChange={(v) => update('riskLevel', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recommendation */}
          <div className="space-y-2">
            <Label>Recommendation</Label>
            <Select
              value={form.recommendation}
              onValueChange={(v) => update('recommendation', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVE">Approve</SelectItem>
                <SelectItem value="APPROVE_WITH_CONDITIONS">
                  Approve with Conditions
                </SelectItem>
                <SelectItem value="DECLINE">Decline</SelectItem>
                <SelectItem value="REFER">Refer for Review</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Findings */}
          <div className="space-y-2">
            <Label>Findings / Notes</Label>
            <textarea
              value={form.findings}
              onChange={(e) => update('findings', e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Describe your findings..."
            />
          </div>

          {/* GPS */}
          <div className="space-y-2">
            <Label>GPS Coordinates (optional)</Label>
            <Input
              value={form.gpsCoordinates}
              onChange={(e) => update('gpsCoordinates', e.target.value)}
              placeholder="e.g. 6.5244, 3.3792"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Submitting...' : 'Submit Verification'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// APPROVAL DIALOG
// ===========================================================================

function ApprovalDialog({
  open,
  onOpenChange,
  loanId,
  decision,
  principalAmount,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loanId: string;
  decision: 'APPROVED' | 'REJECTED';
  principalAmount: number;
  onComplete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [comments, setComments] = useState('');
  const [conditions, setConditions] = useState('');
  const [approvedAmount, setApprovedAmount] = useState(String(principalAmount));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await processApproval({
        loanId,
        decision,
        comments: comments || undefined,
        conditions: conditions || undefined,
        approvedAmount: decision === 'APPROVED' ? parseFloat(approvedAmount) : undefined,
      });

      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        setComments('');
        setConditions('');
        onComplete();
      } else {
        toast.error(result.error || 'Approval processing failed');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === 'APPROVED' ? 'Approve Loan' : 'Reject Loan'}
          </DialogTitle>
          <DialogDescription>
            {decision === 'APPROVED'
              ? 'Confirm approval of this loan application.'
              : 'Provide a reason for rejecting this loan application.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {decision === 'APPROVED' && (
            <div className="space-y-2">
              <Label>Approved Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Requested: {formatCurrency(principalAmount)}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>{decision === 'REJECTED' ? 'Reason for Rejection' : 'Comments'}</Label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder={
                decision === 'REJECTED'
                  ? 'Reason for rejection...'
                  : 'Optional comments...'
              }
              required={decision === 'REJECTED'}
            />
          </div>

          {decision === 'APPROVED' && (
            <div className="space-y-2">
              <Label>Conditions (optional)</Label>
              <textarea
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Any conditions for approval..."
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              variant={decision === 'REJECTED' ? 'destructive' : 'default'}
              className={
                decision === 'APPROVED'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : ''
              }
            >
              {isPending
                ? 'Processing...'
                : decision === 'APPROVED'
                ? 'Confirm Approval'
                : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// DISBURSEMENT DIALOG
// ===========================================================================

function DisbursementDialog({
  open,
  onOpenChange,
  loanId,
  principalAmount,
  approvedAmount,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loanId: string;
  principalAmount: number;
  approvedAmount: number;
  onComplete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    disbursementMode: 'BANK_TRANSFER',
    bankName: '',
    accountNumber: '',
    accountName: '',
    chequeNumber: '',
    reference: '',
    notes: '',
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await disburseLoan({
        loanId,
        disbursementMode: form.disbursementMode,
        bankName: form.bankName || undefined,
        accountNumber: form.accountNumber || undefined,
        accountName: form.accountName || undefined,
        chequeNumber: form.chequeNumber || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        onComplete();
      } else {
        toast.error(result.error || 'Disbursement failed');
      }
    });
  }

  const showBankFields =
    form.disbursementMode === 'BANK_TRANSFER' ||
    form.disbursementMode === 'CHEQUE';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Disburse Loan</DialogTitle>
          <DialogDescription>
            Approved amount: {formatCurrency(approvedAmount)}
            {approvedAmount !== principalAmount && (
              <span className="block text-xs mt-1">
                (Requested: {formatCurrency(principalAmount)})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Disbursement Mode</Label>
            <Select
              value={form.disbursementMode}
              onValueChange={(v) => update('disbursementMode', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showBankFields && (
            <>
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input
                  value={form.bankName}
                  onChange={(e) => update('bankName', e.target.value)}
                  placeholder="Enter bank name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={form.accountNumber}
                  onChange={(e) => update('accountNumber', e.target.value)}
                  placeholder="Enter account number"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Account Name</Label>
                <Input
                  value={form.accountName}
                  onChange={(e) => update('accountName', e.target.value)}
                  placeholder="Enter account name"
                  required
                />
              </div>
            </>
          )}

          {form.disbursementMode === 'CHEQUE' && (
            <div className="space-y-2">
              <Label>Cheque Number</Label>
              <Input
                value={form.chequeNumber}
                onChange={(e) => update('chequeNumber', e.target.value)}
                placeholder="Enter cheque number"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input
              value={form.reference}
              onChange={(e) => update('reference', e.target.value)}
              placeholder="Transaction reference"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Additional notes..."
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Confirm Disbursement</p>
                <p>
                  This will disburse {formatCurrency(approvedAmount)} and activate
                  the loan. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isPending ? 'Processing...' : 'Confirm Disbursement'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// REPAYMENT DIALOG
// ===========================================================================

function RepaymentDialog({
  open,
  onOpenChange,
  loanId,
  monthlyInstalment,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loanId: string;
  monthlyInstalment: number;
  onComplete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    amount: String(monthlyInstalment),
    paymentMode: 'CASH',
    paymentReference: '',
    notes: '',
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    startTransition(async () => {
      const result = await processRepayment({
        loanId,
        amount,
        paymentMode: form.paymentMode,
        paymentReference: form.paymentReference || undefined,
        notes: form.notes || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        setForm({
          amount: String(monthlyInstalment),
          paymentMode: 'CASH',
          paymentReference: '',
          notes: '',
        });
        onComplete();
      } else {
        toast.error(result.error || 'Repayment failed');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Monthly instalment: {formatCurrency(monthlyInstalment)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Payment Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Payment Mode</Label>
            <Select
              value={form.paymentMode}
              onValueChange={(v) => update('paymentMode', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="MOBILE_MONEY">Mobile Money</SelectItem>
                <SelectItem value="DEDUCTION">Salary Deduction</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Payment Reference (optional)</Label>
            <Input
              value={form.paymentReference}
              onChange={(e) => update('paymentReference', e.target.value)}
              placeholder="Teller/receipt/transaction number"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Payment notes..."
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Processing...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// RESTRUCTURING DIALOG
// ===========================================================================

function RestructuringDialog({
  open,
  onOpenChange,
  loanId,
  currentTenure,
  currentRate,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loanId: string;
  currentTenure: number;
  currentRate: number;
  onComplete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    restructuringType: 'TENURE_CHANGE' as 'TENURE_CHANGE' | 'RATE_CHANGE' | 'PARTIAL_WRITE_OFF' | 'COMBINED',
    newTenure: '',
    newInterestRate: '',
    writeOffAmount: '',
    reason: '',
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }

    startTransition(async () => {
      const result = await requestRestructuring({
        loanId,
        restructuringType: form.restructuringType,
        newTenure: form.newTenure ? parseInt(form.newTenure) : undefined,
        newInterestRate: form.newInterestRate ? parseFloat(form.newInterestRate) : undefined,
        writeOffAmount: form.writeOffAmount ? parseFloat(form.writeOffAmount) : undefined,
        reason: form.reason,
      });

      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        setForm({
          restructuringType: 'TENURE_CHANGE',
          newTenure: '',
          newInterestRate: '',
          writeOffAmount: '',
          reason: '',
        });
        onComplete();
      } else {
        toast.error(result.error || 'Restructuring request failed');
      }
    });
  }

  const showTenure = form.restructuringType === 'TENURE_CHANGE' || form.restructuringType === 'COMBINED';
  const showRate = form.restructuringType === 'RATE_CHANGE' || form.restructuringType === 'COMBINED';
  const showWriteOff = form.restructuringType === 'PARTIAL_WRITE_OFF' || form.restructuringType === 'COMBINED';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Loan Restructuring</DialogTitle>
          <DialogDescription>
            Current tenure: {currentTenure} months &middot; Current rate: {currentRate}% p.a.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Restructuring Type</Label>
            <Select
              value={form.restructuringType}
              onValueChange={(v) => update('restructuringType', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TENURE_CHANGE">Tenure Change</SelectItem>
                <SelectItem value="RATE_CHANGE">Rate Change</SelectItem>
                <SelectItem value="PARTIAL_WRITE_OFF">Partial Write-Off</SelectItem>
                <SelectItem value="COMBINED">Combined</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showTenure && (
            <div className="space-y-2">
              <Label>New Tenure (months)</Label>
              <Input
                type="number"
                min="1"
                max="360"
                value={form.newTenure}
                onChange={(e) => update('newTenure', e.target.value)}
                placeholder={`Current: ${currentTenure}`}
                required={form.restructuringType === 'TENURE_CHANGE'}
              />
            </div>
          )}

          {showRate && (
            <div className="space-y-2">
              <Label>New Interest Rate (% p.a.)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.newInterestRate}
                onChange={(e) => update('newInterestRate', e.target.value)}
                placeholder={`Current: ${currentRate}%`}
                required={form.restructuringType === 'RATE_CHANGE'}
              />
            </div>
          )}

          {showWriteOff && (
            <div className="space-y-2">
              <Label>Write-Off Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.writeOffAmount}
                onChange={(e) => update('writeOffAmount', e.target.value)}
                placeholder="Amount to write off"
                required={form.restructuringType === 'PARTIAL_WRITE_OFF'}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason / Justification</Label>
            <textarea
              value={form.reason}
              onChange={(e) => update('reason', e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Provide a detailed reason for restructuring (min 10 characters)..."
              required
            />
            <p className="text-xs text-muted-foreground">{form.reason.length}/10 characters minimum</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// WRITE-OFF DIALOG
// ===========================================================================

function WriteOffDialog({
  open,
  onOpenChange,
  loanId,
  loanNumber,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  loanId: string;
  loanNumber: string;
  onComplete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    if (confirmation !== loanNumber) {
      toast.error(`Please type "${loanNumber}" to confirm write-off`);
      return;
    }

    startTransition(async () => {
      const result = await writeOffLoan({ loanId, reason });
      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        setReason('');
        setConfirmation('');
        onComplete();
      } else {
        toast.error(result.error || 'Write-off failed');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Write Off Loan</DialogTitle>
          <DialogDescription>
            This action permanently writes off all outstanding balances for loan {loanNumber}.
            GL entries will be posted to Bad Debt Expense.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Irreversible Action</p>
                <p>
                  This will mark all outstanding schedule items as WAIVED, post
                  GL write-off entries, and change the loan status to WRITTEN_OFF.
                  This cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason for Write-Off</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Provide a detailed reason for write-off (min 10 characters)..."
              required
            />
            <p className="text-xs text-muted-foreground">{reason.length}/10 characters minimum</p>
          </div>

          <div className="space-y-2">
            <Label>
              Type <span className="font-mono font-bold">{loanNumber}</span> to confirm
            </Label>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={loanNumber}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || confirmation !== loanNumber}
              variant="destructive"
            >
              {isPending ? 'Processing...' : 'Confirm Write-Off'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
