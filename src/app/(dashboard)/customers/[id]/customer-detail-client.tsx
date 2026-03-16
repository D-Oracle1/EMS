'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Pencil,
  ShieldCheck,
  User,
  Phone,
  Mail,
  MapPin,
  Building,
  Briefcase,
  CreditCard,
  Landmark,
  PiggyBank,
  Wallet,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
import { PermissionGate } from '@/components/permission-gate';
import { verifyCustomerKYC } from '@/actions/customer.actions';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Loan {
  id: string;
  loanNumber: string;
  principalAmount: number;
  totalRepayment: number;
  interestRate: number;
  status: string;
  tenure: number;
  disbursedAt?: string | Date | null;
  createdAt: string | Date;
  product?: { name: string } | null;
}

interface SavingsAccount {
  id: string;
  accountNumber: string;
  currentBalance: number;
  status: string;
  createdAt: string | Date;
  product?: { name: string } | null;
}

interface FixedDeposit {
  id: string;
  certificateNumber?: string | null;
  principalAmount: number;
  maturityAmount: number;
  interestRate: number;
  tenure: number;
  status: string;
  maturityDate?: string | Date | null;
  createdAt: string | Date;
}

interface Customer {
  id: string;
  customerNumber: string;
  customerType: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone: string;
  email?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  dateOfBirth?: string | Date | null;
  gender?: string | null;
  occupation?: string | null;
  employer?: string | null;
  monthlyIncome: number;
  bvn?: string | null;
  nationalId?: string | null;
  nokName?: string | null;
  nokRelationship?: string | null;
  nokPhone?: string | null;
  nokAddress?: string | null;
  companyName?: string | null;
  rcNumber?: string | null;
  status: string;
  kycVerified: boolean;
  kycVerifiedAt?: string | Date | null;
  riskRating?: string | null;
  branch?: { name: string; code?: string } | null;
  createdAt: string | Date;
  loans: Loan[];
  savingsAccounts: SavingsAccount[];
  fixedDeposits: FixedDeposit[];
}

interface CustomerDetailClientProps {
  customer: Customer;
}

type TabKey = 'overview' | 'loans' | 'savings' | 'fixed-deposits';

function getStatusBadge(status: string) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Active</Badge>;
    case 'INACTIVE':
      return <Badge variant="secondary">Inactive</Badge>;
    case 'SUSPENDED':
      return <Badge variant="destructive">Suspended</Badge>;
    case 'BLACKLISTED':
      return <Badge variant="error">Blacklisted</Badge>;
    case 'DISBURSED':
      return <Badge variant="success">Disbursed</Badge>;
    case 'PENDING':
      return <Badge variant="warning">Pending</Badge>;
    case 'APPROVED':
      return <Badge variant="info">Approved</Badge>;
    case 'CLOSED':
      return <Badge variant="secondary">Closed</Badge>;
    case 'MATURED':
      return <Badge variant="info">Matured</Badge>;
    case 'WRITTEN_OFF':
      return <Badge variant="error">Written Off</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getRiskBadge(rating: string | null | undefined) {
  switch (rating) {
    case 'LOW':
      return <Badge variant="success">Low Risk</Badge>;
    case 'MEDIUM':
      return <Badge variant="warning">Medium Risk</Badge>;
    case 'HIGH':
      return <Badge variant="error">High Risk</Badge>;
    default:
      return <Badge variant="outline">Not Rated</Badge>;
  }
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || '-'}</p>
      </div>
    </div>
  );
}

export function CustomerDetailClient({ customer }: CustomerDetailClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showKycDialog, setShowKycDialog] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fullName = [customer.title, customer.firstName, customer.middleName, customer.lastName]
    .filter(Boolean)
    .join(' ');

  const handleVerifyKYC = () => {
    startTransition(async () => {
      const result = await verifyCustomerKYC(customer.id);
      if (result.success) {
        toast.success(result.message || 'KYC verification completed');
        setShowKycDialog(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to verify KYC');
      }
    });
  };

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'loans', label: 'Loans', count: customer.loans.length },
    { key: 'savings', label: 'Savings', count: customer.savingsAccounts.length },
    { key: 'fixed-deposits', label: 'Fixed Deposits', count: customer.fixedDeposits.length },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/customers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
              {getStatusBadge(customer.status)}
              {getRiskBadge(customer.riskRating)}
            </div>
            <p className="text-muted-foreground mt-1">
              {customer.customerNumber} &middot;{' '}
              {customer.customerType === 'INDIVIDUAL' ? 'Individual' : 'Corporate'} &middot;{' '}
              Joined {formatDate(customer.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!customer.kycVerified && (
            <PermissionGate permission="CUSTOMERS:UPDATE">
              <Button
                variant="warning"
                onClick={() => setShowKycDialog(true)}
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                Verify KYC
              </Button>
            </PermissionGate>
          )}
          <PermissionGate permission="CUSTOMERS:UPDATE">
            <Button variant="outline" asChild>
              <Link href={`/customers/${customer.id}?edit=true`}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* KYC Status Banner */}
      {customer.kycVerified ? (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-sm font-medium text-green-800">KYC Verified</p>
            {customer.kycVerifiedAt && (
              <p className="text-xs text-green-600">
                Verified on {formatDate(customer.kycVerifiedAt)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <div>
            <p className="text-sm font-medium text-yellow-800">KYC Pending</p>
            <p className="text-xs text-yellow-600">
              Customer identity has not been verified yet
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab customer={customer} />
      )}
      {activeTab === 'loans' && (
        <LoansTab loans={customer.loans} />
      )}
      {activeTab === 'savings' && (
        <SavingsTab accounts={customer.savingsAccounts} />
      )}
      {activeTab === 'fixed-deposits' && (
        <FixedDepositsTab deposits={customer.fixedDeposits} />
      )}

      {/* KYC Verify Dialog */}
      <Dialog open={showKycDialog} onOpenChange={setShowKycDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Customer KYC</DialogTitle>
            <DialogDescription>
              Confirm that you have verified the identity documents for{' '}
              <strong>{fullName}</strong> ({customer.customerNumber}). This action
              will mark the customer as KYC verified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
              <p><strong>BVN:</strong> {customer.bvn || 'Not provided'}</p>
              <p><strong>National ID:</strong> {customer.nationalId || 'Not provided'}</p>
              <p><strong>Phone:</strong> {customer.phone}</p>
              <p><strong>Address:</strong> {customer.address}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowKycDialog(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleVerifyKYC} disabled={isPending}>
              {isPending ? 'Verifying...' : 'Confirm KYC Verification'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OverviewTab({ customer }: { customer: Customer }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Personal Information */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoItem icon={User} label="Full Name" value={
              [customer.title, customer.firstName, customer.middleName, customer.lastName]
                .filter(Boolean)
                .join(' ')
            } />
            <InfoItem icon={Hash} label="Customer Number" value={customer.customerNumber} />
            <InfoItem icon={Phone} label="Phone" value={customer.phone} />
            <InfoItem icon={Mail} label="Email" value={customer.email || '-'} />
            <InfoItem icon={Calendar} label="Date of Birth" value={
              customer.dateOfBirth ? formatDate(customer.dateOfBirth) : '-'
            } />
            <InfoItem icon={User} label="Gender" value={customer.gender || '-'} />
            <InfoItem icon={MapPin} label="Address" value={customer.address} />
            <InfoItem icon={MapPin} label="City / State" value={
              [customer.city, customer.state].filter(Boolean).join(', ') || '-'
            } />
          </div>
        </CardContent>
      </Card>

      {/* Account Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Loans</span>
            </div>
            <span className="font-semibold">{customer.loans.length}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Savings</span>
            </div>
            <span className="font-semibold">{customer.savingsAccounts.length}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Fixed Deposits</span>
            </div>
            <span className="font-semibold">{customer.fixedDeposits.length}</span>
          </div>

          <Separator />

          <InfoItem
            icon={Building}
            label="Branch"
            value={customer.branch?.name || '-'}
          />
          <InfoItem
            icon={CreditCard}
            label="Monthly Income"
            value={customer.monthlyIncome ? formatCurrency(customer.monthlyIncome) : '-'}
          />
        </CardContent>
      </Card>

      {/* Employment & Financial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Employment & Financial
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoItem icon={Briefcase} label="Occupation" value={customer.occupation || '-'} />
            <InfoItem icon={Building} label="Employer" value={customer.employer || '-'} />
            <InfoItem icon={CreditCard} label="BVN" value={customer.bvn || '-'} />
            <InfoItem icon={CreditCard} label="National ID" value={customer.nationalId || '-'} />
            {customer.customerType === 'CORPORATE' && (
              <>
                <InfoItem icon={Building} label="Company Name" value={customer.companyName || '-'} />
                <InfoItem icon={Hash} label="RC Number" value={customer.rcNumber || '-'} />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Next of Kin */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Next of Kin
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoItem icon={User} label="Name" value={customer.nokName || '-'} />
            <InfoItem icon={User} label="Relationship" value={customer.nokRelationship || '-'} />
            <InfoItem icon={Phone} label="Phone" value={customer.nokPhone || '-'} />
            <InfoItem icon={MapPin} label="Address" value={customer.nokAddress || '-'} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LoansTab({ loans }: { loans: Loan[] }) {
  const router = useRouter();

  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Landmark className="h-8 w-8" />
            <p>No loans found for this customer</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Loans ({loans.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loan #</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Principal</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Tenure</TableHead>
              <TableHead>Total Repayment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.map((loan) => (
              <TableRow
                key={loan.id}
                className="cursor-pointer"
                onClick={() => router.push(`/loans/${loan.id}`)}
              >
                <TableCell className="font-mono text-sm">
                  {loan.loanNumber}
                </TableCell>
                <TableCell>{loan.product?.name || '-'}</TableCell>
                <TableCell>{formatCurrency(loan.principalAmount)}</TableCell>
                <TableCell>{loan.interestRate}%</TableCell>
                <TableCell>{loan.tenure} months</TableCell>
                <TableCell>{formatCurrency(loan.totalRepayment)}</TableCell>
                <TableCell>{getStatusBadge(loan.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(loan.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SavingsTab({ accounts }: { accounts: SavingsAccount[] }) {
  const router = useRouter();

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <PiggyBank className="h-8 w-8" />
            <p>No savings accounts found for this customer</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Savings Accounts ({accounts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account #</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Current Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Opened</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow
                key={account.id}
                className="cursor-pointer"
                onClick={() => router.push(`/savings/${account.id}`)}
              >
                <TableCell className="font-mono text-sm">
                  {account.accountNumber}
                </TableCell>
                <TableCell>{account.product?.name || '-'}</TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(account.currentBalance)}
                </TableCell>
                <TableCell>{getStatusBadge(account.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(account.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FixedDepositsTab({ deposits }: { deposits: FixedDeposit[] }) {
  const router = useRouter();

  if (deposits.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Wallet className="h-8 w-8" />
            <p>No fixed deposits found for this customer</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Fixed Deposits ({deposits.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Certificate #</TableHead>
              <TableHead>Principal</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Tenure</TableHead>
              <TableHead>Maturity Amount</TableHead>
              <TableHead>Maturity Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deposits.map((fd) => (
              <TableRow
                key={fd.id}
                className="cursor-pointer"
                onClick={() => router.push(`/fixed-deposits/${fd.id}`)}
              >
                <TableCell className="font-mono text-sm">
                  {fd.certificateNumber || '-'}
                </TableCell>
                <TableCell>{formatCurrency(fd.principalAmount)}</TableCell>
                <TableCell>{fd.interestRate}%</TableCell>
                <TableCell>{fd.tenure} months</TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(fd.maturityAmount)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {fd.maturityDate ? formatDate(fd.maturityDate) : '-'}
                </TableCell>
                <TableCell>{getStatusBadge(fd.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
