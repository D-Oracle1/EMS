'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Landmark } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { createFixedDeposit } from '@/actions/fixed-deposit.actions';

interface FormData {
  customerId: string;
  principalAmount: string;
  tenure: string;
  interestRate: string;
  fundingMode: string;
  fundingReference: string;
  interestPayment: string;
  maturityInstruction: string;
}

const initialFormData: FormData = {
  customerId: '',
  principalAmount: '',
  tenure: '',
  interestRate: '',
  fundingMode: 'CASH',
  fundingReference: '',
  interestPayment: 'AT_MATURITY',
  maturityInstruction: 'ROLLOVER_PRINCIPAL_AND_INTEREST',
};

const currencyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
});

export default function NewFixedDepositPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Auto-calculate interest amount, maturity amount, and maturity date
  const calculations = useMemo(() => {
    const principal = parseFloat(form.principalAmount);
    const tenure = parseInt(form.tenure, 10);
    const rate = parseFloat(form.interestRate);

    if (isNaN(principal) || isNaN(tenure) || isNaN(rate) || principal <= 0 || tenure <= 0 || rate <= 0) {
      return { interestAmount: 0, maturityAmount: 0, maturityDate: null };
    }

    // Interest = P * R * T / 365 / 100
    const interestAmount =
      Math.round(((principal * rate * tenure) / 365 / 100) * 100) / 100;
    const maturityAmount = Math.round((principal + interestAmount) * 100) / 100;

    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + tenure);

    return { interestAmount, maturityAmount, maturityDate };
  }, [form.principalAmount, form.tenure, form.interestRate]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!form.customerId.trim()) {
      newErrors.customerId = 'Customer ID is required';
    }
    if (!form.principalAmount || parseFloat(form.principalAmount) <= 0) {
      newErrors.principalAmount = 'Principal amount must be greater than 0';
    }
    if (!form.tenure || parseInt(form.tenure, 10) <= 0) {
      newErrors.tenure = 'Tenure must be greater than 0 days';
    }
    if (!form.interestRate || parseFloat(form.interestRate) <= 0) {
      newErrors.interestRate = 'Interest rate must be greater than 0';
    }
    if (!form.fundingMode) {
      newErrors.fundingMode = 'Funding mode is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    startTransition(async () => {
      try {
        const result = await createFixedDeposit({
          customerId: form.customerId.trim(),
          principalAmount: parseFloat(form.principalAmount),
          tenure: parseInt(form.tenure, 10),
          interestRate: parseFloat(form.interestRate),
          fundingMode: form.fundingMode,
          fundingReference: form.fundingReference.trim() || undefined,
          interestPayment: form.interestPayment,
          maturityInstruction: form.maturityInstruction,
        });

        if (result.success && result.data) {
          toast.success(
            result.message || `Fixed deposit ${result.data.certificateNumber} created`
          );
          router.push('/fixed-deposits');
        } else {
          toast.error(result.error || 'Failed to create fixed deposit');
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to create fixed deposit');
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/fixed-deposits">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            New Fixed Deposit
          </h1>
          <p className="text-muted-foreground">
            Create a new fixed deposit certificate
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer ID *</Label>
              <Input
                id="customerId"
                value={form.customerId}
                onChange={(e) => updateField('customerId', e.target.value)}
                placeholder="Enter customer ID"
              />
              {errors.customerId && (
                <p className="text-xs text-destructive">{errors.customerId}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Deposit Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Deposit Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="principalAmount">Principal Amount *</Label>
                <Input
                  id="principalAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.principalAmount}
                  onChange={(e) =>
                    updateField('principalAmount', e.target.value)
                  }
                />
                {errors.principalAmount && (
                  <p className="text-xs text-destructive">
                    {errors.principalAmount}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenure">Tenure (days) *</Label>
                <Input
                  id="tenure"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 90"
                  value={form.tenure}
                  onChange={(e) => updateField('tenure', e.target.value)}
                />
                {errors.tenure && (
                  <p className="text-xs text-destructive">{errors.tenure}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="interestRate">Interest Rate (%) *</Label>
                <Input
                  id="interestRate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 12.5"
                  value={form.interestRate}
                  onChange={(e) => updateField('interestRate', e.target.value)}
                />
                {errors.interestRate && (
                  <p className="text-xs text-destructive">
                    {errors.interestRate}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Funding */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Funding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fundingMode">Funding Mode *</Label>
                <Select
                  value={form.fundingMode}
                  onValueChange={(value) => updateField('fundingMode', value)}
                >
                  <SelectTrigger id="fundingMode">
                    <SelectValue placeholder="Select funding mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="TRANSFER">Transfer</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                  </SelectContent>
                </Select>
                {errors.fundingMode && (
                  <p className="text-xs text-destructive">
                    {errors.fundingMode}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fundingReference">
                  Funding Reference (optional)
                </Label>
                <Input
                  id="fundingReference"
                  placeholder="Reference number"
                  value={form.fundingReference}
                  onChange={(e) =>
                    updateField('fundingReference', e.target.value)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Interest & Maturity Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Interest & Maturity Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interestPayment">Interest Payment</Label>
                <Select
                  value={form.interestPayment}
                  onValueChange={(value) =>
                    updateField('interestPayment', value)
                  }
                >
                  <SelectTrigger id="interestPayment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AT_MATURITY">At Maturity</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maturityInstruction">
                  Maturity Instruction
                </Label>
                <Select
                  value={form.maturityInstruction}
                  onValueChange={(value) =>
                    updateField('maturityInstruction', value)
                  }
                >
                  <SelectTrigger id="maturityInstruction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROLLOVER_PRINCIPAL_AND_INTEREST">
                      Rollover Principal & Interest
                    </SelectItem>
                    <SelectItem value="ROLLOVER_PRINCIPAL">
                      Rollover Principal Only
                    </SelectItem>
                    <SelectItem value="PAYOUT">Payout</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calculated Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Calculated Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Interest Amount</p>
                <p className="text-xl font-bold">
                  {calculations.interestAmount > 0
                    ? currencyFormatter.format(calculations.interestAmount)
                    : '--'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Maturity Amount</p>
                <p className="text-xl font-bold">
                  {calculations.maturityAmount > 0
                    ? currencyFormatter.format(calculations.maturityAmount)
                    : '--'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Maturity Date</p>
                <p className="text-xl font-bold">
                  {calculations.maturityDate
                    ? calculations.maturityDate.toLocaleDateString('en-NG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/fixed-deposits">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            <Save className="h-4 w-4 mr-2" />
            {isPending ? 'Creating...' : 'Create Fixed Deposit'}
          </Button>
        </div>
      </form>
    </div>
  );
}
