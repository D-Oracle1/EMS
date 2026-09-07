'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Wallet, Plus, Pencil, Archive, Loader2, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  getFixedDepositRates,
  createFixedDepositRate,
  updateFixedDepositRate,
  retireFixedDepositRate,
  resolveFixedDepositRate,
} from '@/actions/product.actions';
import type { SessionUser } from '@/types';

interface DepositRatesClientProps {
  user: SessionUser;
}

const emptyForm = {
  minTenure: '',
  maxTenure: '',
  minAmount: '',
  maxAmount: '',
  interestRate: '',
};

export function DepositRatesClient({ user }: DepositRatesClientProps) {
  const [rates, setRates] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isPending, startTransition] = useTransition();

  // Rate calculator
  const [testTenure, setTestTenure] = useState('90');
  const [testAmount, setTestAmount] = useState('500000');
  const [testResult, setTestResult] = useState<string | null>(null);

  const canManage = user.permissions.includes('SYSTEM:CONFIG_MANAGE');

  function load() {
    startTransition(async () => {
      try {
        const data = await getFixedDepositRates(true);
        setRates(data);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load rate bands');
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(rate: any) {
    setForm({
      minTenure: String(rate.minTenure),
      maxTenure: String(rate.maxTenure),
      minAmount: String(rate.minAmount),
      maxAmount: rate.maxAmount != null ? String(rate.maxAmount) : '',
      interestRate: String(rate.interestRate),
    });
    setEditingId(rate.id);
    setDialogOpen(true);
  }

  function save() {
    const minTenure = parseInt(form.minTenure, 10);
    const maxTenure = parseInt(form.maxTenure, 10);
    const minAmount = parseFloat(form.minAmount);
    const interestRate = parseFloat(form.interestRate);
    const maxAmount = form.maxAmount.trim() === '' ? null : parseFloat(form.maxAmount);

    if (
      !Number.isFinite(minTenure) ||
      !Number.isFinite(maxTenure) ||
      !Number.isFinite(minAmount) ||
      !Number.isFinite(interestRate)
    ) {
      toast.error('Fill in the tenure range, minimum amount and interest rate');
      return;
    }

    startTransition(async () => {
      const payload = { minTenure, maxTenure, minAmount, maxAmount, interestRate };
      const result = editingId
        ? await updateFixedDepositRate(editingId, payload)
        : await createFixedDepositRate(payload);

      if (result.success) {
        toast.success(result.message);
        setDialogOpen(false);
        load();
      } else {
        toast.error(result.error || 'Failed to save the rate band');
      }
    });
  }

  function retire(rate: any) {
    startTransition(async () => {
      const result = await retireFixedDepositRate(rate.id);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to retire the rate band');
      }
    });
  }

  function testRate() {
    const tenure = parseInt(testTenure, 10);
    const amount = parseFloat(testAmount);
    if (!Number.isFinite(tenure) || !Number.isFinite(amount)) {
      toast.error('Enter a tenure in days and an amount');
      return;
    }

    startTransition(async () => {
      const result = await resolveFixedDepositRate(tenure, amount);
      if (result.success && result.data) {
        setTestResult(`${result.data.interestRate}% per annum`);
      } else {
        setTestResult(null);
        toast.error(result.error || 'No matching band');
      }
    });
  }

  const activeRates = rates.filter((r) => r.isActive);
  const retiredRates = rates.filter((r) => !r.isActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
              Settings
            </Link>
            <span className="text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Fixed Deposit Rates</h1>
          <p className="text-muted-foreground">
            Rate bands are matched on tenure and amount. Bands may not overlap.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Rate Band
          </Button>
        )}
      </div>

      {/* Rate calculator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5" />
            Rate Lookup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="test-tenure">Tenure (days)</Label>
              <Input
                id="test-tenure"
                type="number"
                value={testTenure}
                onChange={(e) => setTestTenure(e.target.value)}
                className="w-32"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-amount">Amount</Label>
              <Input
                id="test-amount"
                type="number"
                value={testAmount}
                onChange={(e) => setTestAmount(e.target.value)}
                className="w-44"
              />
            </div>
            <Button variant="outline" onClick={testRate} disabled={isPending}>
              Resolve Rate
            </Button>
            {testResult && (
              <div className="rounded-md border bg-muted/50 px-4 py-2">
                <span className="text-sm text-muted-foreground">Applicable rate: </span>
                <span className="font-semibold">{testResult}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5" />
            Active Bands
            <Badge variant="secondary">{activeRates.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenure</TableHead>
                <TableHead>Amount Range</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeRates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {isPending
                      ? 'Loading…'
                      : 'No active rate bands. Fixed deposits cannot be priced until one exists.'}
                  </TableCell>
                </TableRow>
              )}
              {activeRates.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {rate.minTenure}–{rate.maxTenure} days
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatCurrency(rate.minAmount)}
                    {rate.maxAmount != null ? ` – ${formatCurrency(rate.maxAmount)}` : ' and above'}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {rate.interestRate}%
                  </TableCell>
                  <TableCell>{formatDate(rate.effectiveFrom)}</TableCell>
                  <TableCell>
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(rate)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => retire(rate)}>
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {retiredRates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">
              Retired Bands
              <Badge variant="outline" className="ml-2">
                {retiredRates.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenure</TableHead>
                  <TableHead>Amount Range</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Retired</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retiredRates.map((rate) => (
                  <TableRow key={rate.id} className="text-muted-foreground">
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {rate.minTenure}–{rate.maxTenure} days
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatCurrency(rate.minAmount)}
                      {rate.maxAmount != null ? ` – ${formatCurrency(rate.maxAmount)}` : '+'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{rate.interestRate}%</TableCell>
                    <TableCell>{rate.effectiveTo ? formatDate(rate.effectiveTo) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Rate Band' : 'New Rate Band'}</DialogTitle>
            <DialogDescription>
              When several bands match a deposit, the narrowest tenure window wins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="r-mint">Minimum Tenure (days)</Label>
                <Input
                  id="r-mint"
                  type="number"
                  min={1}
                  value={form.minTenure}
                  onChange={(e) => setForm({ ...form, minTenure: e.target.value })}
                  placeholder="30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-maxt">Maximum Tenure (days)</Label>
                <Input
                  id="r-maxt"
                  type="number"
                  min={1}
                  value={form.maxTenure}
                  onChange={(e) => setForm({ ...form, maxTenure: e.target.value })}
                  placeholder="90"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="r-mina">Minimum Amount</Label>
                <Input
                  id="r-mina"
                  type="number"
                  min={0}
                  value={form.minAmount}
                  onChange={(e) => setForm({ ...form, minAmount: e.target.value })}
                  placeholder="100000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="r-maxa">Maximum Amount</Label>
                <Input
                  id="r-maxa"
                  type="number"
                  min={0}
                  value={form.maxAmount}
                  onChange={(e) => setForm({ ...form, maxAmount: e.target.value })}
                  placeholder="Leave blank for no ceiling"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-rate">Annual Interest Rate (%)</Label>
              <Input
                id="r-rate"
                type="number"
                step="0.01"
                value={form.interestRate}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                placeholder="12.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Save Changes' : 'Create Band'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
