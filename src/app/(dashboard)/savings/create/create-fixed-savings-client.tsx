'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PiggyBank, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getFixedSavingsProducts, createFixedSavingsAccount } from '@/actions/fixed-savings.actions';
import {
  CustomerPicker,
  emptyCustomerSelection,
  validateCustomerSelection,
  toActionCustomer,
  type CustomerSelection,
} from '@/components/customer-picker';
import type { SessionUser } from '@/types';

interface Props { user: SessionUser; }

export function CreateFixedSavingsClient({ user }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [customerSel, setCustomerSel] = useState<CustomerSelection>(emptyCustomerSelection);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [initialDeposit, setInitialDeposit] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;

  const maturityDate = selectedProduct && startDate
    ? (() => {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + selectedProduct.durationMonths);
        return d;
      })()
    : null;

  const projectedInterest = selectedProduct && initialDeposit && parseFloat(initialDeposit) > 0
    ? (parseFloat(initialDeposit) * selectedProduct.totalInterestRate / 100)
    : null;

  useEffect(() => {
    getFixedSavingsProducts()
      .then(setProducts)
      .catch(() => toast.error('Failed to load savings plans'));
  }, []);

  async function handleSubmit() {
    const customerErr = validateCustomerSelection(customerSel);
    if (customerErr) return toast.error(customerErr);
    if (!selectedProductId) return toast.error('Select a savings plan');
    if (!initialDeposit || parseFloat(initialDeposit) <= 0) return toast.error('Enter initial deposit amount');
    if (selectedProduct && parseFloat(initialDeposit) < selectedProduct.minDeposit) {
      return toast.error(`Minimum deposit for this plan is ₦${Number(selectedProduct.minDeposit).toLocaleString()}`);
    }

    setSubmitting(true);
    try {
      const result = await createFixedSavingsAccount({
        ...toActionCustomer(customerSel),
        productId: selectedProductId,
        initialDeposit: parseFloat(initialDeposit),
        startDate,
      });
      if (result.success) {
        toast.success(result.message);
        router.push(`/savings/${result.data?.id}`);
      } else {
        toast.error(result.error);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-rise">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="rounded-full shrink-0">
          <Link href="/savings/accounts"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="icon-tile icon-tile-emerald hidden sm:flex">
            <PiggyBank className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Open Fixed Savings Account</h1>
            <p className="text-sm text-muted-foreground">Create a new fixed-term savings account</p>
          </div>
        </div>
      </div>

      {/* Step 1: Customer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1 — Select Customer</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerPicker value={customerSel} onChange={setCustomerSel} />
        </CardContent>
      </Card>

      {/* Step 2: Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 2 — Select Savings Plan</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active fixed savings plans.{' '}
              <Link href="/settings/savings-products" className="text-primary underline">Configure plans</Link> first.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProductId(p.id)}
                  className={`text-left rounded-lg border p-4 transition-all ${
                    selectedProductId === p.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'hover:border-muted-foreground/50'
                  }`}
                >
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{p.totalInterestRate}%</p>
                  <p className="text-sm text-muted-foreground">{p.durationMonths} months</p>
                  <Separator className="my-2" />
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p>Monthly: {parseFloat(p.monthlyInterestRate ?? 0).toFixed(4)}%</p>
                    <p>Min deposit: ₦{Number(p.minDeposit ?? 0).toLocaleString()}</p>
                    {p.allowEarlyTermination && <p className="text-orange-600">Early exit allowed</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Amount */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 3 — Deposit & Start Date</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Initial Deposit (₦) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={selectedProduct?.minDeposit ?? 0}
                step={0.01}
                placeholder="0.00"
                value={initialDeposit}
                onChange={(e) => setInitialDeposit(e.target.value)}
              />
              {selectedProduct && (
                <p className="text-xs text-muted-foreground">
                  Min: ₦{Number(selectedProduct.minDeposit).toLocaleString()}
                  {selectedProduct.maxBalance ? ` · Max: ₦${Number(selectedProduct.maxBalance).toLocaleString()}` : ''}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          {selectedProduct && initialDeposit && parseFloat(initialDeposit) > 0 && maturityDate && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4">
              <p className="font-semibold text-green-800 dark:text-green-200 mb-3">Projection</p>
              <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                <span className="text-muted-foreground">Maturity Date:</span>
                <span className="font-medium">
                  {maturityDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <span className="text-muted-foreground">Principal Deposited:</span>
                <span>₦{Number(initialDeposit).toLocaleString()}</span>
                <span className="text-muted-foreground">Total Interest ({selectedProduct.totalInterestRate}%):</span>
                <span className="text-green-600">+₦{projectedInterest ? projectedInterest.toLocaleString() : '0'}</span>
                <span className="text-muted-foreground font-semibold">Expected Maturity Value:</span>
                <span className="font-bold text-green-700 text-base">
                  ₦{projectedInterest
                    ? (parseFloat(initialDeposit) + projectedInterest).toLocaleString()
                    : Number(initialDeposit).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Opening balance rule: the initial deposit earns interest from the first monthly roll.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.back()} disabled={submitting}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !selectedProductId || !initialDeposit}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Open Account
        </Button>
      </div>
    </div>
  );
}
