'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, PiggyBank } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createSavingsAccount, getSavingsProducts } from '@/actions/savings.actions';
import {
  CustomerPicker,
  emptyCustomerSelection,
  validateCustomerSelection,
  toActionCustomer,
  type CustomerSelection,
} from '@/components/customer-picker';
import type { SessionUser } from '@/types';

interface SavingsNewClientProps {
  user: SessionUser;
}

export function SavingsNewClient({ user }: SavingsNewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [products, setProducts] = useState<any[]>([]);

  const [customerSel, setCustomerSel] = useState<CustomerSelection>(emptyCustomerSelection);
  const [productId, setProductId] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedProduct = products.find((p) => p.id === productId);
  const isTargetProduct = selectedProduct?.savingsType === 'TARGET';

  useEffect(() => {
    startTransition(async () => {
      try {
        const data = await getSavingsProducts();
        setProducts(data);
      } catch {
        toast.error('Failed to load savings products');
      }
    });
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};
    const customerErr = validateCustomerSelection(customerSel);
    if (customerErr) errs.customerId = customerErr;
    if (!productId) errs.productId = 'Select a savings product';
    if (isTargetProduct && !targetAmount) errs.targetAmount = 'Target amount is required for target savings';
    if (isTargetProduct && !targetDate) errs.targetDate = 'Target date is required for target savings';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    startTransition(async () => {
      const result = await createSavingsAccount({
        ...toActionCustomer(customerSel),
        productId,
        targetAmount: targetAmount ? parseFloat(targetAmount) : undefined,
        targetDate: targetDate || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        router.push('/savings');
      } else {
        toast.error(result.error || 'Failed to create savings account');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/savings"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Savings Account</h1>
          <p className="text-muted-foreground">Create a new savings account for a customer</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PiggyBank className="h-5 w-5" />
                  Account Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CustomerPicker value={customerSel} onChange={setCustomerSel} />
                {errors.customerId && <p className="text-sm text-destructive">{errors.customerId}</p>}

                <div className="space-y-2">
                  <Label htmlFor="productId">Savings Product</Label>
                  <Select value={productId} onValueChange={(v) => { setProductId(v); setErrors((p) => ({ ...p, productId: '' })); }}>
                    <SelectTrigger id="productId">
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.code}) - {p.savingsType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.productId && <p className="text-sm text-destructive">{errors.productId}</p>}
                </div>

                {isTargetProduct && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="targetAmount">Target Amount</Label>
                      <Input
                        id="targetAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={targetAmount}
                        onChange={(e) => { setTargetAmount(e.target.value); setErrors((p) => ({ ...p, targetAmount: '' })); }}
                      />
                      {errors.targetAmount && <p className="text-sm text-destructive">{errors.targetAmount}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="targetDate">Target Date</Label>
                      <Input
                        id="targetDate"
                        type="date"
                        value={targetDate}
                        onChange={(e) => { setTargetDate(e.target.value); setErrors((p) => ({ ...p, targetDate: '' })); }}
                      />
                      {errors.targetDate && <p className="text-sm text-destructive">{errors.targetDate}</p>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Product Info</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedProduct ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{selectedProduct.savingsType}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Interest Rate</span><span className="font-medium">{selectedProduct.interestRate}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Interest Freq</span><span className="font-medium">{selectedProduct.interestFrequency}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Min Balance</span><span className="font-medium">{selectedProduct.minBalance}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Min Deposit</span><span className="font-medium">{selectedProduct.minDeposit}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Withdrawal</span><span className="font-medium">{selectedProduct.allowWithdrawal ? 'Allowed' : 'Not Allowed'}</span></div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a product to see details</p>
                )}
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create Savings Account'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
