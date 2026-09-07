'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Landmark, Plus, Pencil, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { formatCurrency } from '@/lib/utils';
import {
  getLoanProducts,
  createLoanProduct,
  updateLoanProduct,
  setLoanProductActive,
  getPostableAccounts,
} from '@/actions/product.actions';
import type { SessionUser } from '@/types';

interface LoanProductsClientProps {
  user: SessionUser;
}

const INTEREST_TYPES = [
  { value: 'FLAT', label: 'Flat Rate', hint: 'Interest on the original principal for the full tenure' },
  { value: 'REDUCING_BALANCE', label: 'Reducing Balance', hint: 'Interest on the outstanding balance each period' },
  { value: 'COMPOUND', label: 'Compound', hint: 'Interest compounds on unpaid interest' },
];

const NONE = '__none';

const emptyForm = {
  code: '',
  name: '',
  description: '',
  minAmount: '',
  maxAmount: '',
  minTenure: '1',
  maxTenure: '12',
  interestRate: '',
  interestType: 'REDUCING_BALANCE',
  processingFee: '0',
  insuranceFee: '',
  lateFee: '',
  gracePeriodDays: '0',
  penaltyRate: '',
  requiresCollateral: false,
  requiresGuarantor: false,
  loanReceivableAccountId: NONE,
  interestIncomeAccountId: NONE,
  feeIncomeAccountId: NONE,
};

export function LoanProductsClient({ user }: LoanProductsClientProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInUse, setEditingInUse] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('SYSTEM:CONFIG_MANAGE');

  function load() {
    startTransition(async () => {
      try {
        const data = await getLoanProducts(true);
        setProducts(data);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load loan products');
      }
    });
  }

  useEffect(() => {
    load();
    if (canManage) {
      getPostableAccounts()
        .then(setAccounts)
        .catch(() => setAccounts([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setEditingInUse(false);
    setDialogOpen(true);
  }

  function openEdit(product: any) {
    setForm({
      code: product.code,
      name: product.name,
      description: product.description ?? '',
      minAmount: String(product.minAmount),
      maxAmount: String(product.maxAmount),
      minTenure: String(product.minTenure),
      maxTenure: String(product.maxTenure),
      interestRate: String(product.interestRate),
      interestType: product.interestType,
      processingFee: String(product.processingFee),
      insuranceFee: product.insuranceFee != null ? String(product.insuranceFee) : '',
      lateFee: product.lateFee != null ? String(product.lateFee) : '',
      gracePeriodDays: String(product.gracePeriodDays),
      penaltyRate: product.penaltyRate != null ? String(product.penaltyRate) : '',
      requiresCollateral: product.requiresCollateral,
      requiresGuarantor: product.requiresGuarantor,
      loanReceivableAccountId: product.loanReceivableAccountId ?? NONE,
      interestIncomeAccountId: product.interestIncomeAccountId ?? NONE,
      feeIncomeAccountId: product.feeIncomeAccountId ?? NONE,
    });
    setEditingId(product.id);
    setEditingInUse(product.usageCount > 0);
    setDialogOpen(true);
  }

  const num = (value: string) => (value.trim() === '' ? undefined : parseFloat(value));
  const accountId = (value: string) => (value === NONE ? undefined : value);

  function save() {
    if (!form.name.trim() || (!editingId && !form.code.trim())) {
      toast.error('Product code and name are required');
      return;
    }

    const minAmount = num(form.minAmount);
    const maxAmount = num(form.maxAmount);
    const interestRate = num(form.interestRate);

    if (minAmount === undefined || maxAmount === undefined || interestRate === undefined) {
      toast.error('Amount range and interest rate are required');
      return;
    }

    startTransition(async () => {
      if (editingId) {
        // Contract terms are frozen once loans exist, so omit them when in use.
        const result = await updateLoanProduct(editingId, {
          name: form.name,
          description: form.description,
          minAmount,
          maxAmount,
          ...(editingInUse
            ? {}
            : {
                minTenure: parseInt(form.minTenure, 10),
                maxTenure: parseInt(form.maxTenure, 10),
                interestRate,
                interestType: form.interestType as any,
                processingFee: num(form.processingFee) ?? 0,
              }),
          insuranceFee: num(form.insuranceFee),
          lateFee: num(form.lateFee),
          gracePeriodDays: parseInt(form.gracePeriodDays, 10) || 0,
          penaltyRate: num(form.penaltyRate),
          requiresCollateral: form.requiresCollateral,
          requiresGuarantor: form.requiresGuarantor,
          loanReceivableAccountId: accountId(form.loanReceivableAccountId),
          interestIncomeAccountId: accountId(form.interestIncomeAccountId),
          feeIncomeAccountId: accountId(form.feeIncomeAccountId),
        });
        finish(result);
      } else {
        const result = await createLoanProduct({
          code: form.code,
          name: form.name,
          description: form.description || undefined,
          minAmount,
          maxAmount,
          minTenure: parseInt(form.minTenure, 10),
          maxTenure: parseInt(form.maxTenure, 10),
          interestRate,
          interestType: form.interestType as any,
          processingFee: num(form.processingFee) ?? 0,
          insuranceFee: num(form.insuranceFee),
          lateFee: num(form.lateFee),
          gracePeriodDays: parseInt(form.gracePeriodDays, 10) || 0,
          penaltyRate: num(form.penaltyRate),
          requiresCollateral: form.requiresCollateral,
          requiresGuarantor: form.requiresGuarantor,
          loanReceivableAccountId: accountId(form.loanReceivableAccountId),
          interestIncomeAccountId: accountId(form.interestIncomeAccountId),
          feeIncomeAccountId: accountId(form.feeIncomeAccountId),
        });
        finish(result);
      }
    });
  }

  function finish(result: { success: boolean; message?: string; error?: string }) {
    if (result.success) {
      toast.success(result.message);
      setDialogOpen(false);
      load();
    } else {
      toast.error(result.error || 'Failed to save product');
    }
  }

  function toggleActive(product: any) {
    startTransition(async () => {
      const result = await setLoanProductActive(product.id, !product.isActive);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to update product');
      }
    });
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Loan Products</h1>
          <p className="text-muted-foreground">
            The lending products loan officers can originate against.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Product
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Landmark className="h-5 w-5" />
            Products
            <Badge variant="secondary">{products.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Amount Range</TableHead>
                <TableHead>Tenure</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Fees</TableHead>
                <TableHead>Requires</TableHead>
                <TableHead className="text-right">Loans</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    {isPending ? 'Loading…' : 'No loan products configured yet'}
                  </TableCell>
                </TableRow>
              )}
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="font-medium">{product.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{product.code}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">
                    {formatCurrency(product.minAmount)} – {formatCurrency(product.maxAmount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">
                    {product.minTenure}–{product.maxTenure} mo
                  </TableCell>
                  <TableCell>
                    <div className="font-medium tabular-nums">{product.interestRate}%</div>
                    <div className="text-xs text-muted-foreground">
                      {product.interestType.replace('_', ' ').toLowerCase()}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    <div>{product.processingFee}% processing</div>
                    {product.penaltyRate != null && (
                      <div className="text-xs text-muted-foreground">
                        {product.penaltyRate}%/day penalty
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {product.requiresCollateral && (
                        <Badge variant="outline" className="text-[11px]">
                          Collateral
                        </Badge>
                      )}
                      {product.requiresGuarantor && (
                        <Badge variant="outline" className="text-[11px]">
                          Guarantor
                        </Badge>
                      )}
                      {!product.requiresCollateral && !product.requiresGuarantor && '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{product.usageCount}</TableCell>
                  <TableCell>
                    <Switch
                      checked={product.isActive}
                      onCheckedChange={() => toggleActive(product)}
                      disabled={!canManage || isPending}
                      aria-label={`Toggle ${product.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    {canManage && (
                      <Button size="sm" variant="ghost" onClick={() => openEdit(product)}>
                        {product.usageCount > 0 ? (
                          <Lock className="h-3.5 w-3.5" />
                        ) : (
                          <Pencil className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Loan Product' : 'New Loan Product'}</DialogTitle>
            <DialogDescription>
              Terms here become the defaults on every loan originated against this product.
            </DialogDescription>
          </DialogHeader>

          {editingInUse && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Loans have been booked against this product, so the rate, interest type, tenure
                band and processing fee are locked. Create a new product version to change them.
              </span>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-code">Code</Label>
                <Input
                  id="p-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={Boolean(editingId)}
                  placeholder="SME_LOAN"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-name">Name</Label>
                <Input
                  id="p-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="SME Business Loan"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-desc">Description</Label>
              <Input
                id="p-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Who this product is for"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-min">Minimum Amount</Label>
                <Input
                  id="p-min"
                  type="number"
                  min={0}
                  value={form.minAmount}
                  onChange={(e) => setForm({ ...form, minAmount: e.target.value })}
                  placeholder="50000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-max">Maximum Amount</Label>
                <Input
                  id="p-max"
                  type="number"
                  min={0}
                  value={form.maxAmount}
                  onChange={(e) => setForm({ ...form, maxAmount: e.target.value })}
                  placeholder="5000000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-mintenure">Minimum Tenure (months)</Label>
                <Input
                  id="p-mintenure"
                  type="number"
                  min={1}
                  max={360}
                  value={form.minTenure}
                  onChange={(e) => setForm({ ...form, minTenure: e.target.value })}
                  disabled={editingInUse}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-maxtenure">Maximum Tenure (months)</Label>
                <Input
                  id="p-maxtenure"
                  type="number"
                  min={1}
                  max={360}
                  value={form.maxTenure}
                  onChange={(e) => setForm({ ...form, maxTenure: e.target.value })}
                  disabled={editingInUse}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-rate">Annual Interest Rate (%)</Label>
                <Input
                  id="p-rate"
                  type="number"
                  step="0.01"
                  value={form.interestRate}
                  onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                  disabled={editingInUse}
                  placeholder="24"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-type">Interest Type</Label>
                <Select
                  value={form.interestType}
                  onValueChange={(v) => setForm({ ...form, interestType: v })}
                  disabled={editingInUse}
                >
                  <SelectTrigger id="p-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTEREST_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {INTEREST_TYPES.find((t) => t.value === form.interestType)?.hint}
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-fee">Processing Fee (%)</Label>
                <Input
                  id="p-fee"
                  type="number"
                  step="0.01"
                  value={form.processingFee}
                  onChange={(e) => setForm({ ...form, processingFee: e.target.value })}
                  disabled={editingInUse}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-ins">Insurance Fee (%)</Label>
                <Input
                  id="p-ins"
                  type="number"
                  step="0.01"
                  value={form.insuranceFee}
                  onChange={(e) => setForm({ ...form, insuranceFee: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-late">Late Fee (flat)</Label>
                <Input
                  id="p-late"
                  type="number"
                  value={form.lateFee}
                  onChange={(e) => setForm({ ...form, lateFee: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-grace">Grace Period (days)</Label>
                <Input
                  id="p-grace"
                  type="number"
                  min={0}
                  value={form.gracePeriodDays}
                  onChange={(e) => setForm({ ...form, gracePeriodDays: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-penalty">Penalty Rate (%/day)</Label>
                <Input
                  id="p-penalty"
                  type="number"
                  step="0.01"
                  value={form.penaltyRate}
                  onChange={(e) => setForm({ ...form, penaltyRate: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.requiresCollateral}
                  onCheckedChange={(v) => setForm({ ...form, requiresCollateral: v })}
                />
                Requires collateral
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.requiresGuarantor}
                  onCheckedChange={(v) => setForm({ ...form, requiresGuarantor: v })}
                />
                Requires guarantor
              </label>
            </div>

            <Separator />

            <div>
              <h4 className="mb-3 text-sm font-medium">General Ledger Mapping</h4>
              <p className="mb-3 text-xs text-muted-foreground">
                Optional. When set, disbursements and repayments post to these accounts instead of
                the system defaults.
              </p>
              <div className="space-y-3">
                {[
                  { key: 'loanReceivableAccountId' as const, label: 'Loan Receivable' },
                  { key: 'interestIncomeAccountId' as const, label: 'Interest Income' },
                  { key: 'feeIncomeAccountId' as const, label: 'Fee Income' },
                ].map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`gl-${field.key}`}>{field.label}</Label>
                    <Select
                      value={form[field.key]}
                      onValueChange={(v) => setForm({ ...form, [field.key]: v })}
                    >
                      <SelectTrigger id={`gl-${field.key}`}>
                        <SelectValue placeholder="System default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>System default</SelectItem>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Save Changes' : 'Create Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
