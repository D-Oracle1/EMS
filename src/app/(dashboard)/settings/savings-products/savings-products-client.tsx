'use client';

import { useEffect, useState, useTransition } from 'react';
import { PlusCircle, Settings, Edit2, PowerOff, Power, Trash2, Sparkles, Loader2, CheckCircle, XCircle, Database } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  getFixedSavingsProducts,
  createFixedSavingsProduct,
  updateFixedSavingsProduct,
  deactivateFixedSavingsProduct,
  reactivateFixedSavingsProduct,
  deleteFixedSavingsProduct,
  seedFixedSavingsProducts,
} from '@/actions/fixed-savings.actions';
import type { SessionUser } from '@/types';

interface SavingsProductsClientProps {
  user: SessionUser;
}

const emptyForm = {
  name: '',
  description: '',
  durationMonths: '',
  totalInterestRate: '',
  minimumDeposit: '',
  maximumDeposit: '',
  interestCalculationMethod: 'COMPOUND',
  interestEligibilityDelayMonths: '0',
  allowEarlyTermination: false,
  defaultTerminationPenaltyRate: '',
  promoActive: false,
  promoName: '',
  promoTotalInterestRate: '',
  promoStartsAt: '',
  promoEndsAt: '',
};

/** Date input wants yyyy-mm-dd; the server hands back an ISO timestamp. */
function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

const INTEREST_METHODS = [
  { value: 'MATURITY_ONLY', label: 'Maturity Only', hint: 'Accrue monthly, pay lump sum at maturity' },
  { value: 'MONTHLY_ALLOCATION', label: 'Monthly Allocation', hint: 'Credit interest to the balance each month' },
  { value: 'FLAT', label: 'Flat (provisional)', hint: 'Reserved — currently accrues like Maturity Only' },
  { value: 'COMPOUND', label: 'Compound', hint: 'Interest compounds into the eligible balance' },
] as const;

export function SavingsProductsClient({ user }: SavingsProductsClientProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState<string | null>(null);

  const canManage = user.permissions.includes('SETTINGS:MANAGE');

  function loadProducts() {
    startTransition(async () => {
      try {
        const data = await getFixedSavingsProducts(true);
        setProducts(data);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load products');
      }
    });
  }

  useEffect(() => { loadProducts(); }, []);

  const computedMonthlyRate =
    form.totalInterestRate && form.durationMonths
      ? (parseFloat(form.totalInterestRate) / parseFloat(form.durationMonths)).toFixed(4)
      : null;

  const promoMonthlyRate =
    form.promoTotalInterestRate && form.durationMonths
      ? (parseFloat(form.promoTotalInterestRate) / parseFloat(form.durationMonths)).toFixed(4)
      : null;

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  }

  function openEdit(product: any) {
    setForm({
      name: product.name,
      description: product.description ?? '',
      durationMonths: String(product.durationMonths ?? ''),
      totalInterestRate: String(product.totalInterestRate ?? ''),
      minimumDeposit: String(product.minDeposit ?? ''),
      maximumDeposit: String(product.maxBalance ?? ''),
      interestCalculationMethod: product.interestCalculationMethod ?? 'MATURITY_ONLY',
      interestEligibilityDelayMonths: String(product.interestEligibilityDelayMonths ?? 0),
      allowEarlyTermination: product.allowEarlyTermination ?? false,
      defaultTerminationPenaltyRate: String(product.defaultTerminationPenaltyRate ?? ''),
      promoActive: product.promoActive ?? false,
      promoName: product.promoName ?? '',
      promoTotalInterestRate: String(product.promoTotalInterestRate ?? ''),
      promoStartsAt: toDateInput(product.promoStartsAt),
      promoEndsAt: toDateInput(product.promoEndsAt),
    });
    setEditingId(product.id);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return toast.error('Product name is required');
    if (!form.durationMonths || parseInt(form.durationMonths) < 1) return toast.error('Duration must be at least 1 month');
    if (!form.totalInterestRate || parseFloat(form.totalInterestRate) <= 0) return toast.error('Total interest rate is required');
    if (!form.minimumDeposit || parseFloat(form.minimumDeposit) < 0) return toast.error('Minimum deposit is required');

    setLoading('submit');
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        durationMonths: parseInt(form.durationMonths),
        totalInterestRate: parseFloat(form.totalInterestRate),
        minimumDeposit: parseFloat(form.minimumDeposit),
        maximumDeposit: form.maximumDeposit ? parseFloat(form.maximumDeposit) : undefined,
        interestCalculationMethod: form.interestCalculationMethod as 'MATURITY_ONLY' | 'MONTHLY_ALLOCATION' | 'FLAT' | 'COMPOUND',
        interestEligibilityDelayMonths: parseInt(form.interestEligibilityDelayMonths) || 0,
        allowEarlyTermination: form.allowEarlyTermination,
        defaultTerminationPenaltyRate: form.defaultTerminationPenaltyRate ? parseFloat(form.defaultTerminationPenaltyRate) : undefined,
        promoActive: form.promoActive,
        promoName: form.promoName.trim() || undefined,
        promoTotalInterestRate: form.promoTotalInterestRate ? parseFloat(form.promoTotalInterestRate) : undefined,
        promoStartsAt: form.promoStartsAt || undefined,
        promoEndsAt: form.promoEndsAt || undefined,
      };

      const result = editingId
        ? await updateFixedSavingsProduct(editingId, payload)
        : await createFixedSavingsProduct(payload);

      if (result.success) {
        toast.success(result.message);
        setDialogOpen(false);
        loadProducts();
      } else {
        toast.error(result.error);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function handleDeactivate(id: string, name: string) {
    if (!confirm(`Deactivate "${name}"? Existing accounts will not be affected.`)) return;
    setLoading(id);
    try {
      const result = await deactivateFixedSavingsProduct(id);
      if (result.success) { toast.success(result.message); loadProducts(); }
      else toast.error(result.error);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  }

  async function handleReactivate(id: string, name: string) {
    setLoading(id);
    try {
      const result = await reactivateFixedSavingsProduct(id);
      if (result.success) { toast.success(result.message); loadProducts(); }
      else toast.error(result.error);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}" permanently? This is only possible because no account has been opened on it.`)) return;
    setLoading(id);
    try {
      const result = await deleteFixedSavingsProduct(id);
      if (result.success) { toast.success(result.message); loadProducts(); }
      else toast.error(result.error);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  }

  async function handleSeed() {
    if (!confirm('Seed the 3 default savings products (4M, 8M, 12M)? Existing products with same code will be skipped.')) return;
    setLoading('seed');
    try {
      const result = await seedFixedSavingsProducts();
      if (result.success) { toast.success(result.message); loadProducts(); }
      else toast.error(result.error);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Fixed Savings Products
          </h1>
          <p className="text-muted-foreground">
            Configure fixed-term savings plans. Monthly rates are computed automatically.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSeed} disabled={loading === 'seed'}>
              {loading === 'seed' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Seed Defaults
            </Button>
            <Button onClick={openCreate}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Product
            </Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Products" color="slate" value={products.length} />
        <StatCard
          title="Total Accounts"
          color="sky"
          value={products.reduce((s, p) => s + p.usageCount, 0)}
        />
        <StatCard
          title="Active"
          color="emerald"
          value={products.filter((p) => p.isActive).length}
        />
        <StatCard
          title="Inactive"
          color="amber"
          value={products.filter((p) => !p.isActive).length}
        />
        <StatCard
          title="Promos Running"
          color="fuchsia"
          value={products.filter((p) => p.promoRunning).length}
          icon={Sparkles}
        />
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Fixed Savings Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan Name</TableHead>
                  <TableHead className="text-center">Duration</TableHead>
                  <TableHead className="text-center">Total Rate</TableHead>
                  <TableHead className="text-center">Promo</TableHead>
                  <TableHead className="text-center">Monthly Rate</TableHead>
                  <TableHead className="text-right">Min Deposit</TableHead>
                  <TableHead className="text-right">Max Deposit</TableHead>
                  <TableHead className="text-center">Early Exit</TableHead>
                  <TableHead className="text-center">Penalty %</TableHead>
                  <TableHead className="text-center">Accounts</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  {canManage && <TableHead className="text-center">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                )}
                {!isPending && products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      No fixed savings products configured. Click &quot;New Product&quot; or &quot;Seed Defaults&quot;.
                    </TableCell>
                  </TableRow>
                )}
                {products.map((p) => (
                  <TableRow key={p.id} className={!p.isActive ? 'opacity-50' : ''}>
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                    </TableCell>
                    <TableCell className="text-center">{p.durationMonths} months</TableCell>
                    <TableCell className="text-center font-semibold text-green-700">{p.totalInterestRate}%</TableCell>
                    <TableCell className="text-center">
                      {p.promoTotalInterestRate ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge variant={p.promoRunning ? 'success' : 'secondary'} className="gap-1">
                            <Sparkles className="h-3 w-3" />
                            {p.promoTotalInterestRate}%
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {p.promoRunning ? p.promoWindow : p.promoActive ? `scheduled · ${p.promoWindow}` : 'off'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm">{parseFloat(p.monthlyInterestRate ?? 0).toFixed(4)}%</TableCell>
                    <TableCell className="text-right">₦{Number(p.minDeposit ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{p.maxBalance ? `₦${Number(p.maxBalance).toLocaleString()}` : '—'}</TableCell>
                    <TableCell className="text-center">
                      {p.allowEarlyTermination ? <CheckCircle className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center">{p.defaultTerminationPenaltyRate ? `${p.defaultTerminationPenaltyRate}%` : '—'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={p.usageCount > 0 ? 'default' : 'secondary'}>{p.usageCount}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={p.isActive ? 'success' : 'secondary'}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex items-center gap-1 justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(p)}
                            disabled={loading !== null}
                            title={
                              p.usageCount > 0
                                ? 'Edit — existing savers keep the terms they were opened on'
                                : 'Edit product'
                            }
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {p.isActive ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeactivate(p.id, p.name)}
                              disabled={loading !== null}
                              title="Deactivate — stops appearing when opening new accounts"
                            >
                              {loading === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PowerOff className="h-3.5 w-3.5" />}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReactivate(p.id, p.name)}
                              disabled={loading !== null}
                              title="Make available again"
                            >
                              {loading === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          {p.usageCount === 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(p.id, p.name)}
                              disabled={loading !== null}
                              title="Delete — only possible while unused"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {products.map((p) => (
              <Card key={p.id} className={!p.isActive ? 'opacity-60' : ''}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.durationMonths} months • {p.totalInterestRate}% total</p>
                    </div>
                    <Badge variant={p.isActive ? 'success' : 'secondary'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    <span className="text-muted-foreground">Monthly Rate:</span><span>{parseFloat(p.monthlyInterestRate ?? 0).toFixed(4)}%</span>
                    <span className="text-muted-foreground">Min Deposit:</span><span>₦{Number(p.minDeposit ?? 0).toLocaleString()}</span>
                    <span className="text-muted-foreground">Accounts:</span><span>{p.usageCount}</span>
                    <span className="text-muted-foreground">Early Exit:</span><span>{p.allowEarlyTermination ? 'Yes' : 'No'}</span>
                  </div>
                  {canManage && p.isActive && (
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(p)} disabled={p.usageCount > 0}>Edit</Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDeactivate(p.id, p.name)}>Deactivate</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Savings Product' : 'New Fixed Savings Product'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label>Plan Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. 12 Month Plan"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            <Separator />
            <p className="text-sm font-medium">Interest Configuration</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Duration (months) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  placeholder="e.g. 12"
                  value={form.durationMonths}
                  onChange={(e) => setForm((f) => ({ ...f, durationMonths: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total Interest Rate (%) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.01}
                  placeholder="e.g. 17"
                  value={form.totalInterestRate}
                  onChange={(e) => setForm((f) => ({ ...f, totalInterestRate: e.target.value }))}
                />
              </div>
            </div>

            {computedMonthlyRate && (
              <div className="bg-muted rounded-md p-3 text-sm">
                <span className="text-muted-foreground">Auto-calculated monthly rate: </span>
                <span className="font-semibold text-green-700">{computedMonthlyRate}% / month</span>
                <span className="text-muted-foreground ml-2">(= {form.totalInterestRate}% ÷ {form.durationMonths} months)</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Interest Calculation Method</Label>
              <Select
                value={form.interestCalculationMethod}
                onValueChange={(v) => setForm((f) => ({ ...f, interestCalculationMethod: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {INTEREST_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {INTEREST_METHODS.find((m) => m.value === form.interestCalculationMethod)?.hint}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Interest Eligibility Delay (months)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={form.interestEligibilityDelayMonths}
                onChange={(e) => setForm((f) => ({ ...f, interestEligibilityDelayMonths: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Months after opening before deposits start earning interest (usually 0 or 1)</p>
            </div>

            <Separator />
            <p className="text-sm font-medium">Deposit Limits</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Minimum Deposit (₦) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 50000"
                  value={form.minimumDeposit}
                  onChange={(e) => setForm((f) => ({ ...f, minimumDeposit: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Maximum Deposit (₦)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Leave blank for no limit"
                  value={form.maximumDeposit}
                  onChange={(e) => setForm((f) => ({ ...f, maximumDeposit: e.target.value }))}
                />
              </div>
            </div>

            <Separator />
            <p className="text-sm font-medium">Early Termination</p>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">Allow Early Termination</p>
                <p className="text-sm text-muted-foreground">Permit clients to request termination before maturity</p>
              </div>
              <Switch
                checked={form.allowEarlyTermination}
                onCheckedChange={(v) => setForm((f) => ({ ...f, allowEarlyTermination: v }))}
              />
            </div>

            {form.allowEarlyTermination && (
              <div className="space-y-1.5">
                <Label>Default Penalty Rate (% of approved interest)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="e.g. 5"
                  value={form.defaultTerminationPenaltyRate}
                  onChange={(e) => setForm((f) => ({ ...f, defaultTerminationPenaltyRate: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Admin can override per request. Used as a guide only.</p>
              </div>
            )}

            <Separator />

            {/* ── Promotional rate ────────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-fuchsia-600" />
                    Promotional rate
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    A better rate for savers who open an account inside the window.
                  </p>
                </div>
                <Switch
                  checked={form.promoActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, promoActive: v }))}
                />
              </div>

              {form.promoActive && (
                <div className="space-y-3 rounded-lg border border-fuchsia-200 bg-fuchsia-50/50 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Promo name</Label>
                      <Input
                        placeholder="e.g. Independence Offer"
                        value={form.promoName}
                        onChange={(e) => setForm((f) => ({ ...f, promoName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Promo total rate (%) <span className="text-destructive">*</span></Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        placeholder={form.totalInterestRate ? `higher than ${form.totalInterestRate}` : 'e.g. 20'}
                        value={form.promoTotalInterestRate}
                        onChange={(e) => setForm((f) => ({ ...f, promoTotalInterestRate: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Starts</Label>
                      <Input
                        type="date"
                        value={form.promoStartsAt}
                        onChange={(e) => setForm((f) => ({ ...f, promoStartsAt: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ends <span className="text-destructive">*</span></Label>
                      <Input
                        type="date"
                        value={form.promoEndsAt}
                        onChange={(e) => setForm((f) => ({ ...f, promoEndsAt: e.target.value }))}
                      />
                    </div>
                  </div>

                  {promoMonthlyRate && (
                    <p className="text-xs text-fuchsia-900">
                      Promo monthly rate: <span className="font-semibold">{promoMonthlyRate}%</span>
                      <span className="text-muted-foreground ml-2">
                        (= {form.promoTotalInterestRate}% ÷ {form.durationMonths} months)
                      </span>
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Savers who open an account between these dates are locked in at the
                    promo rate for their whole term. Ending the promo, or changing the
                    plan later, does not affect anyone who has already joined.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={loading === 'submit'}>
              {loading === 'submit' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Update Product' : 'Create Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
