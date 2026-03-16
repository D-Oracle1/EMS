'use client';

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  Landmark,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import { createLoan, getLoanProducts, checkCustomerOutstandingLoans } from '@/actions/loan.actions';
import { searchCustomers } from '@/actions/customer.actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoanProduct {
  id: string;
  code: string;
  name: string;
  description: string | null;
  minAmount: { toNumber?: () => number } | number;
  maxAmount: { toNumber?: () => number } | number;
  minTenure: number;
  maxTenure: number;
  interestRate: { toNumber?: () => number } | number;
  interestType: string;
  processingFee: { toNumber?: () => number } | number;
  insuranceFee: { toNumber?: () => number } | number | null;
  requiresCollateral: boolean;
  requiresGuarantor: boolean;
}

interface ScheduleItem {
  installmentNumber: number;
  dueDate: Date;
  principalDue: number;
  interestDue: number;
  totalDue: number;
  outstandingBalance: number;
}

// Helper to handle Prisma Decimal or plain number
function toNum(val: { toNumber?: () => number } | number | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val.toNumber) return val.toNumber();
  return Number(val);
}

// ---------------------------------------------------------------------------
// Simple client-side schedule calculation (mirrors server logic for preview)
// ---------------------------------------------------------------------------

function calcReducingBalance(
  principal: number,
  annualRate: number,
  months: number
): { schedule: ScheduleItem[]; totalInterest: number; totalRepayment: number; monthlyInstalment: number } {
  const r = annualRate / 100 / 12;
  const emi =
    r > 0
      ? (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1)
      : principal / months;

  const schedule: ScheduleItem[] = [];
  let balance = principal;
  let totalInterest = 0;
  const now = new Date();

  for (let i = 1; i <= months; i++) {
    const interestDue = +(balance * r).toFixed(2);
    const principalDue = i === months ? +balance.toFixed(2) : +(emi - interestDue).toFixed(2);
    const totalDue = +(principalDue + interestDue).toFixed(2);
    balance = +(balance - principalDue).toFixed(2);
    totalInterest += interestDue;

    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() + i);

    schedule.push({
      installmentNumber: i,
      dueDate,
      principalDue,
      interestDue,
      totalDue,
      outstandingBalance: Math.max(balance, 0),
    });
  }

  return {
    schedule,
    totalInterest: +totalInterest.toFixed(2),
    totalRepayment: +(principal + totalInterest).toFixed(2),
    monthlyInstalment: +emi.toFixed(2),
  };
}

function calcFlatRate(
  principal: number,
  annualRate: number,
  months: number
): { schedule: ScheduleItem[]; totalInterest: number; totalRepayment: number; monthlyInstalment: number } {
  const totalInterest = +((principal * annualRate * months) / 100 / 12).toFixed(2);
  const totalRepayment = +(principal + totalInterest).toFixed(2);
  const monthlyInstalment = +(totalRepayment / months).toFixed(2);
  const monthlyPrincipal = +(principal / months).toFixed(2);
  const monthlyInterest = +(totalInterest / months).toFixed(2);

  const schedule: ScheduleItem[] = [];
  let balance = principal;
  const now = new Date();

  for (let i = 1; i <= months; i++) {
    const principalDue = i === months ? +balance.toFixed(2) : monthlyPrincipal;
    const interestDue = monthlyInterest;
    const totalDue = +(principalDue + interestDue).toFixed(2);
    balance = +(balance - principalDue).toFixed(2);

    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() + i);

    schedule.push({
      installmentNumber: i,
      dueDate,
      principalDue,
      interestDue,
      totalDue,
      outstandingBalance: Math.max(balance, 0),
    });
  }

  return { schedule, totalInterest, totalRepayment, monthlyInstalment };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function NewLoanPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [products, setProducts] = useState<LoanProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Form state
  const [productId, setProductId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [tenure, setTenure] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [collateralDetails, setCollateralDetails] = useState('');
  const [guarantorDetails, setGuarantorDetails] = useState('');

  // Outstanding loans bypass state
  const [outstandingLoans, setOutstandingLoans] = useState<Array<{ id: string; loanNumber: string; principalAmount: number; status: string }>>([]);
  const [owingBypass, setOwingBypass] = useState(false);
  const [owingBypassReason, setOwingBypassReason] = useState('');
  const [checkingOutstanding, setCheckingOutstanding] = useState(false);

  // Customer search state
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<
    { id: string; customerNumber: string; firstName: string; lastName: string; phone: string; email: string | null }[]
  >([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string; customerNumber: string; firstName: string; lastName: string;
  } | null>(null);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule preview
  const [preview, setPreview] = useState<{
    schedule: ScheduleItem[];
    totalInterest: number;
    totalRepayment: number;
    monthlyInstalment: number;
    processingFee: number;
    insuranceFee: number;
  } | null>(null);

  const selectedProduct = products.find((p) => p.id === productId);

  // Load products on mount
  useEffect(() => {
    async function loadProducts() {
      try {
        const data = await getLoanProducts();
        setProducts(data as unknown as LoanProduct[]);
      } catch {
        toast.error('Failed to load loan products');
      } finally {
        setLoadingProducts(false);
      }
    }
    loadProducts();
  }, []);

  // Debounced customer search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!customerQuery || customerQuery.length < 2) {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
      return;
    }

    setSearchingCustomers(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchCustomers(customerQuery);
        setCustomerResults(results as any);
        setShowCustomerDropdown(true);
      } catch {
        setCustomerResults([]);
      } finally {
        setSearchingCustomers(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [customerQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check for outstanding loans when customer is selected
  useEffect(() => {
    if (!customerId) {
      setOutstandingLoans([]);
      setOwingBypass(false);
      setOwingBypassReason('');
      return;
    }
    setCheckingOutstanding(true);
    checkCustomerOutstandingLoans(customerId)
      .then((result) => {
        setOutstandingLoans(result.loans);
        if (!result.hasOutstanding) {
          setOwingBypass(false);
          setOwingBypassReason('');
        }
      })
      .catch(() => setOutstandingLoans([]))
      .finally(() => setCheckingOutstanding(false));
  }, [customerId]);

  // When product changes, set default interest rate
  useEffect(() => {
    if (selectedProduct) {
      setInterestRate(String(toNum(selectedProduct.interestRate)));
    }
  }, [selectedProduct]);

  // Calculate schedule preview
  const calculatePreview = useCallback(() => {
    if (!selectedProduct || !amount || !tenure || !interestRate) {
      setPreview(null);
      return;
    }

    const amt = parseFloat(amount);
    const ten = parseInt(tenure, 10);
    const rate = parseFloat(interestRate);

    if (isNaN(amt) || isNaN(ten) || isNaN(rate) || amt <= 0 || ten <= 0) {
      setPreview(null);
      return;
    }

    const calc =
      selectedProduct.interestType === 'REDUCING_BALANCE'
        ? calcReducingBalance(amt, rate, ten)
        : calcFlatRate(amt, rate, ten);

    const processingFee = +(amt * toNum(selectedProduct.processingFee) / 100).toFixed(2);
    const insuranceFee = selectedProduct.insuranceFee
      ? +(amt * toNum(selectedProduct.insuranceFee) / 100).toFixed(2)
      : 0;

    setPreview({
      ...calc,
      processingFee,
      insuranceFee,
    });
  }, [selectedProduct, amount, tenure, interestRate]);

  useEffect(() => {
    calculatePreview();
  }, [calculatePreview]);

  // Validation
  function validate(): string | null {
    if (!productId) return 'Please select a loan product';
    if (!customerId) return 'Please search and select a customer';
    if (!amount || parseFloat(amount) <= 0) return 'Please enter a valid amount';
    if (!tenure || parseInt(tenure, 10) <= 0) return 'Please enter a valid tenure';

    if (selectedProduct) {
      const amt = parseFloat(amount);
      const ten = parseInt(tenure, 10);
      const min = toNum(selectedProduct.minAmount);
      const max = toNum(selectedProduct.maxAmount);

      if (amt < min || amt > max) {
        return `Amount must be between ${formatCurrency(min)} and ${formatCurrency(max)}`;
      }
      if (ten < selectedProduct.minTenure || ten > selectedProduct.maxTenure) {
        return `Tenure must be between ${selectedProduct.minTenure} and ${selectedProduct.maxTenure} months`;
      }
      if (selectedProduct.requiresCollateral && !collateralDetails.trim()) {
        return 'This product requires collateral details';
      }
      if (selectedProduct.requiresGuarantor && !guarantorDetails.trim()) {
        return 'This product requires guarantor details';
      }
    }

    if (outstandingLoans.length > 0 && !owingBypass) {
      return 'Customer has outstanding loans. Enable bypass with justification to proceed.';
    }
    if (owingBypass && owingBypassReason.trim().length < 10) {
      return 'Owing bypass requires a justification reason (at least 10 characters)';
    }

    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    startTransition(async () => {
      const result = await createLoan({
        customerId: customerId.trim(),
        productId,
        principalAmount: parseFloat(amount),
        tenure: parseInt(tenure, 10),
        interestRate: parseFloat(interestRate),
        purpose: purpose.trim() || undefined,
        collateralDetails: collateralDetails.trim() || undefined,
        guarantorDetails: guarantorDetails.trim() || undefined,
        owingBypass: owingBypass || undefined,
        owingBypassReason: owingBypass ? owingBypassReason.trim() : undefined,
      });

      if (result.success && result.data) {
        toast.success(result.message || 'Loan created successfully');
        router.push(`/loans/${result.data.id}`);
      } else {
        toast.error(result.error || 'Failed to create loan');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/loans">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Loans
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
          <Landmark className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Loan Application</h1>
          <p className="text-sm text-muted-foreground">
            Create a new loan application for a customer
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ---- Left column: Form ---- */}
          <div className="lg:col-span-2 space-y-6">
            {/* Product Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Loan Product</CardTitle>
                <CardDescription>
                  Select the loan product that determines rates and terms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingProducts ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading products...
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Select value={productId} onValueChange={setProductId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a loan product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.code}) - {toNum(p.interestRate)}% p.a.
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedProduct && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Interest Type:</span>{' '}
                      <span className="font-medium">
                        {selectedProduct.interestType.replace(/_/g, ' ')}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Amount Range:</span>{' '}
                      <span className="font-medium">
                        {formatCurrency(toNum(selectedProduct.minAmount))} -{' '}
                        {formatCurrency(toNum(selectedProduct.maxAmount))}
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Tenure:</span>{' '}
                      <span className="font-medium">
                        {selectedProduct.minTenure} - {selectedProduct.maxTenure} months
                      </span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Processing Fee:</span>{' '}
                      <span className="font-medium">
                        {toNum(selectedProduct.processingFee)}%
                      </span>
                    </p>
                    {selectedProduct.requiresCollateral && (
                      <p className="text-amber-600 font-medium">Requires Collateral</p>
                    )}
                    {selectedProduct.requiresGuarantor && (
                      <p className="text-amber-600 font-medium">Requires Guarantor</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Customer & Loan Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Loan Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2" ref={customerSearchRef}>
                  <Label>Customer</Label>
                  {selectedCustomer ? (
                    <div className="flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2">
                      <div className="flex-1 text-sm">
                        <span className="font-medium">
                          {selectedCustomer.firstName} {selectedCustomer.lastName}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          ({selectedCustomer.customerNumber})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(null);
                          setCustomerId('');
                          setCustomerQuery('');
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={customerQuery}
                        onChange={(e) => setCustomerQuery(e.target.value)}
                        onFocus={() => {
                          if (customerResults.length > 0) setShowCustomerDropdown(true);
                        }}
                        placeholder="Search by name, customer number, or phone..."
                        className="pl-9"
                        required
                      />
                      {searchingCustomers && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}

                      {showCustomerDropdown && customerResults.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
                          {customerResults.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                              onClick={() => {
                                setCustomerId(c.id);
                                setSelectedCustomer({
                                  id: c.id,
                                  customerNumber: c.customerNumber,
                                  firstName: c.firstName,
                                  lastName: c.lastName,
                                });
                                setShowCustomerDropdown(false);
                                setCustomerQuery('');
                              }}
                            >
                              <div className="font-medium">
                                {c.firstName} {c.lastName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {c.customerNumber} {c.phone ? `| ${c.phone}` : ''} {c.email ? `| ${c.email}` : ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {showCustomerDropdown && customerQuery.length >= 2 && !searchingCustomers && customerResults.length === 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg px-3 py-3 text-sm text-muted-foreground text-center">
                          No customers found
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Search by customer name, number, or phone
                  </p>
                </div>

                {/* Outstanding Loans Warning */}
                {checkingOutstanding && selectedCustomer && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking for outstanding loans...
                  </div>
                )}
                {outstandingLoans.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          Customer has {outstandingLoans.length} outstanding loan{outstandingLoans.length !== 1 ? 's' : ''}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {outstandingLoans.map((ol) => (
                            <li key={ol.id} className="text-xs text-amber-800">
                              {ol.loanNumber} — {formatCurrency(ol.principalAmount)} ({ol.status})
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <Separator />
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={owingBypass}
                        onChange={(e) => setOwingBypass(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <div>
                        <p className="text-sm font-medium text-amber-900">
                          Proceed despite outstanding loans (requires justification)
                        </p>
                      </div>
                    </label>
                    {owingBypass && (
                      <div className="space-y-1">
                        <Label className="text-amber-900">
                          Justification <span className="text-red-500">*</span>
                        </Label>
                        <textarea
                          value={owingBypassReason}
                          onChange={(e) => setOwingBypassReason(e.target.value)}
                          className="flex min-h-[60px] w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          placeholder="Explain why this loan should proceed despite outstanding debt (min 10 characters)..."
                          required
                        />
                        {owingBypassReason.trim().length > 0 && owingBypassReason.trim().length < 10 && (
                          <p className="text-xs text-red-600">
                            Minimum 10 characters required ({owingBypassReason.trim().length}/10)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Principal Amount</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g. 500000"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tenure (months)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={tenure}
                      onChange={(e) => setTenure(e.target.value)}
                      placeholder="e.g. 12"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Interest Rate (% p.a.)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    placeholder="Annual rate"
                  />
                  {selectedProduct && (
                    <p className="text-xs text-muted-foreground">
                      Product default: {toNum(selectedProduct.interestRate)}%
                    </p>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Purpose</Label>
                  <textarea
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Loan purpose (e.g., Business expansion, Home improvement)"
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    Collateral Details
                    {selectedProduct?.requiresCollateral && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  <textarea
                    value={collateralDetails}
                    onChange={(e) => setCollateralDetails(e.target.value)}
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Describe collateral (type, estimated value, location)"
                    required={selectedProduct?.requiresCollateral}
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    Guarantor Details
                    {selectedProduct?.requiresGuarantor && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  <textarea
                    value={guarantorDetails}
                    onChange={(e) => setGuarantorDetails(e.target.value)}
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Guarantor name, relationship, contact, occupation"
                    required={selectedProduct?.requiresGuarantor}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex gap-3">
              <Link href="/loans">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isPending || !productId}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Landmark className="h-4 w-4 mr-2" />
                    Create Loan Application
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ---- Right column: Preview ---- */}
          <div className="space-y-6">
            {/* Summary Card */}
            {preview && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Loan Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-0 divide-y">
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-muted-foreground">Principal</span>
                    <span className="text-sm font-medium">
                      {formatCurrency(parseFloat(amount))}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-muted-foreground">Total Interest</span>
                    <span className="text-sm font-medium">
                      {formatCurrency(preview.totalInterest)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-muted-foreground">Processing Fee</span>
                    <span className="text-sm font-medium">
                      {formatCurrency(preview.processingFee)}
                    </span>
                  </div>
                  {preview.insuranceFee > 0 && (
                    <div className="flex justify-between py-2">
                      <span className="text-sm text-muted-foreground">Insurance Fee</span>
                      <span className="text-sm font-medium">
                        {formatCurrency(preview.insuranceFee)}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between py-2">
                    <span className="text-sm font-semibold">Total Repayment</span>
                    <span className="text-sm font-bold">
                      {formatCurrency(preview.totalRepayment)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm font-semibold">Monthly Instalment</span>
                    <span className="text-sm font-bold text-primary">
                      {formatCurrency(preview.monthlyInstalment)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Schedule Preview */}
            {preview && preview.schedule.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Schedule Preview</CardTitle>
                  <CardDescription>
                    {preview.schedule.length} monthly instalments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">EMI</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.schedule.map((s) => (
                          <TableRow key={s.installmentNumber}>
                            <TableCell className="font-mono text-xs">
                              {s.installmentNumber}
                            </TableCell>
                            <TableCell className="text-xs">
                              {s.dueDate.toLocaleDateString('en-NG', {
                                year: 'numeric',
                                month: 'short',
                              })}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {formatCurrency(s.totalDue)}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {formatCurrency(s.outstandingBalance)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty state */}
            {!preview && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calculator className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Select a product and enter loan details to see the repayment schedule
                    preview.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
