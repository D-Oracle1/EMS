'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PiggyBank, Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { getFixedSavingsProducts, createFixedSavingsAccount } from '@/actions/fixed-savings.actions';
import {
  CustomerPicker,
  emptyCustomerSelection,
  validateCustomerSelection,
  toActionCustomer,
  type CustomerSelection,
} from '@/components/customer-picker';
import { resolveContractedTerms } from '@/lib/savings-promo';
import { projectSchedule } from '@/lib/savings-projection';
import { InterestSchedule } from '@/components/savings/interest-schedule';
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

  // The rate this saver would actually be locked in at. Resolved with the same
  // function the server uses, against the chosen start date, so the projection
  // shown here is what the account is really opened on.
  const terms = selectedProduct
    ? resolveContractedTerms(selectedProduct, startDate ? new Date(startDate) : new Date())
    : null;

  // Simulate the actual term rather than applying the headline rate in one
  // step: the opening deposit is dormant for its first month, and the method
  // decides whether interest compounds. The old one-line calculation quoted a
  // figure the engine would never pay.
  const projection = terms && selectedProduct && initialDeposit && parseFloat(initialDeposit) > 0
    ? projectSchedule({
        principal: parseFloat(initialDeposit),
        monthlyRate: terms.monthlyRate,
        durationMonths: selectedProduct.durationMonths,
        method: selectedProduct.interestCalculationMethod ?? 'MATURITY_ONLY',
        startDate: startDate || null,
        headlineRate: terms.totalRate,
      })
    : null;

  const projectedInterest = projection ? projection.totalInterest : null;

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
      <div className="premium-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold">1</span>
          <h2 className="font-semibold">Select Customer</h2>
        </div>
        <CustomerPicker value={customerSel} onChange={setCustomerSel} />
      </div>

      {/* Step 2: Plan */}
      <div className="premium-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold">2</span>
          <h2 className="font-semibold">Select Savings Plan</h2>
        </div>
        <div>
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
                  {p.promoRunning ? (
                    <>
                      <p className="text-2xl font-bold text-fuchsia-600 mt-1">
                        {p.promoTotalInterestRate}%
                        <span className="ml-2 text-sm font-normal text-muted-foreground line-through">
                          {p.totalInterestRate}%
                        </span>
                      </p>
                      <p className="flex items-center gap-1 text-xs font-medium text-fuchsia-700">
                        <Sparkles className="h-3 w-3" />
                        {p.promoName ?? 'Promo rate'} · {p.promoWindow}
                      </p>
                    </>
                  ) : (
                    <p className="text-2xl font-bold text-green-600 mt-1">{p.totalInterestRate}%</p>
                  )}
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
        </div>
      </div>

      {/* Step 3: Amount */}
      <div className="premium-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold">3</span>
          <h2 className="font-semibold">Deposit &amp; Start Date</h2>
        </div>
        <div className="space-y-4">
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

          {projection && maturityDate && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Matures on</span>
                <span className="font-semibold">
                  {maturityDate.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>

              {terms?.isPromo && (
                <p className="flex items-start gap-1.5 rounded-md border border-fuchsia-200 bg-fuchsia-50/60 p-2.5 text-xs font-medium text-fuchsia-800">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    {terms.promoName}: locked in at {terms.totalRate}% for the full term.
                    The rate stays with this account even after the promo ends.
                  </span>
                </p>
              )}

              <InterestSchedule
                projection={projection}
                title="What this saver will be paid"
                defaultOpen
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="rounded-full" onClick={() => router.back()} disabled={submitting}>Cancel</Button>
        <Button
          className="rounded-full"
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
