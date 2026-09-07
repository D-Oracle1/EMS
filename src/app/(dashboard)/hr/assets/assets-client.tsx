'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Laptop,
  Plus,
  UserPlus,
  Undo2,
  Loader2,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  getCompanyAssets,
  createCompanyAsset,
  assignAsset,
  returnAsset,
} from '@/actions/hr-engagement.actions';
import { getStaffList } from '@/actions/hr.actions';
import { getBranches } from '@/actions/staff.actions';
import type { SessionUser } from '@/types';

interface AssetsClientProps {
  user: SessionUser;
}

const STATUS_VARIANT: Record<string, any> = {
  AVAILABLE: 'success',
  ASSIGNED: 'info',
  MAINTENANCE: 'warning',
  RETIRED: 'secondary',
  LOST: 'error',
  DAMAGED: 'error',
};

const CATEGORIES = ['IT', 'FURNITURE', 'VEHICLE', 'PHONE', 'TOOLS', 'OTHER'];
const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR'];
const NONE = '__none';

const emptyAsset = {
  assetTag: '',
  name: '',
  category: 'IT',
  make: '',
  model: '',
  serialNumber: '',
  purchaseDate: '',
  purchaseCost: '',
  warrantyUntil: '',
  condition: 'GOOD',
  branchId: NONE,
  notes: '',
};

export function AssetsClient({ user }: AssetsClientProps) {
  const [assets, setAssets] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyAsset);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [assignForm, setAssignForm] = useState({ staffId: '', dueReturnAt: '', notes: '' });
  const [returnTarget, setReturnTarget] = useState<any>(null);
  const [returnForm, setReturnForm] = useState({
    returnCondition: 'GOOD',
    returnNotes: '',
    newStatus: 'AVAILABLE',
  });
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('HR:ASSET_MANAGE');

  function load() {
    startTransition(async () => {
      try {
        setAssets(
          await getCompanyAssets({
            status: statusFilter,
            category: categoryFilter,
            search: search.trim() || undefined,
          })
        );
      } catch (e: any) {
        toast.error(e.message || 'Failed to load assets');
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    Promise.all([getStaffList(), getBranches()])
      .then(([s, b]) => {
        setStaff(s);
        setBranches(b);
      })
      .catch(() => undefined);
  }, []);

  function handleCreate() {
    if (!form.assetTag.trim() || !form.name.trim()) {
      toast.error('Asset tag and name are required');
      return;
    }

    startTransition(async () => {
      const result = await createCompanyAsset({
        assetTag: form.assetTag,
        name: form.name,
        category: form.category,
        make: form.make || undefined,
        model: form.model || undefined,
        serialNumber: form.serialNumber || undefined,
        purchaseDate: form.purchaseDate || undefined,
        purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : undefined,
        warrantyUntil: form.warrantyUntil || undefined,
        condition: form.condition,
        branchId: form.branchId === NONE ? undefined : form.branchId,
        notes: form.notes || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        setCreateOpen(false);
        setForm(emptyAsset);
        load();
      } else {
        toast.error(result.error || 'Failed to register the asset');
      }
    });
  }

  function confirmAssign() {
    if (!assignTarget || !assignForm.staffId) {
      toast.error('Select a staff member');
      return;
    }

    startTransition(async () => {
      const result = await assignAsset({
        assetId: assignTarget.id,
        staffId: assignForm.staffId,
        dueReturnAt: assignForm.dueReturnAt || undefined,
        notes: assignForm.notes || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        setAssignTarget(null);
        setAssignForm({ staffId: '', dueReturnAt: '', notes: '' });
        load();
      } else {
        toast.error(result.error || 'Failed to assign the asset');
      }
    });
  }

  function confirmReturn() {
    if (!returnTarget) return;

    startTransition(async () => {
      const result = await returnAsset({
        assetId: returnTarget.id,
        returnCondition: returnForm.returnCondition,
        returnNotes: returnForm.returnNotes || undefined,
        newStatus: returnForm.newStatus as any,
      });

      if (result.success) {
        toast.success(result.message);
        setReturnTarget(null);
        setReturnForm({ returnCondition: 'GOOD', returnNotes: '', newStatus: 'AVAILABLE' });
        load();
      } else {
        toast.error(result.error || 'Failed to record the return');
      }
    });
  }

  const overdue = assets.filter((a) => a.isOverdue);
  const totalValue = assets.reduce((sum, a) => sum + (a.purchaseCost ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/hr" className="text-sm text-muted-foreground hover:underline">
              Human Resources
            </Link>
            <span className="text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Company Assets</h1>
          <p className="text-muted-foreground">
            Who holds what, and what is due back.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Register Asset
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Assets', value: String(assets.length) },
          { label: 'Assigned', value: String(assets.filter((a) => a.status === 'ASSIGNED').length) },
          { label: 'Available', value: String(assets.filter((a) => a.status === 'AVAILABLE').length) },
          { label: 'Book Value', value: formatCurrency(totalValue) },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {overdue.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <span>
              <strong>{overdue.length}</strong> asset(s) are past their due return date:{' '}
              {overdue
                .slice(0, 3)
                .map((a) => `${a.assetTag} (${a.assignedTo})`)
                .join(', ')}
              {overdue.length > 3 && ` and ${overdue.length - 3} more`}.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search by tag, name or serial number…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {Object.keys(STATUS_VARIANT).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Laptop className="h-5 w-5" />
            Asset Register
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Due Back</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    {isPending ? 'Loading…' : 'No assets match those filters'}
                  </TableCell>
                </TableRow>
              )}
              {assets.map((asset) => (
                <TableRow key={asset.id} className={asset.isOverdue ? 'bg-amber-500/5' : ''}>
                  <TableCell>
                    <div className="font-medium">{asset.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{asset.assetTag}</div>
                    {(asset.make || asset.model) && (
                      <div className="text-xs text-muted-foreground">
                        {[asset.make, asset.model].filter(Boolean).join(' ')}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[11px]">
                      {asset.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{asset.serialNumber ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {asset.assignedTo ?? <span className="text-muted-foreground">—</span>}
                    {asset.assignedAt && (
                      <div className="text-xs text-muted-foreground">
                        since {formatDate(asset.assignedAt)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {asset.dueReturnAt ? (
                      <span className={asset.isOverdue ? 'font-medium text-amber-600' : ''}>
                        {formatDate(asset.dueReturnAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {asset.purchaseCost != null ? formatCurrency(asset.purchaseCost) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[asset.status] ?? 'default'}>
                      {asset.status}
                    </Badge>
                    <div className="mt-1 text-[11px] text-muted-foreground">{asset.condition}</div>
                  </TableCell>
                  <TableCell>
                    {canManage && (
                      <div className="flex gap-1">
                        {asset.status === 'AVAILABLE' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAssignTarget(asset)}
                            title="Assign to a staff member"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {asset.status === 'ASSIGNED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setReturnTarget(asset)}
                            title="Record return"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Register asset */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register Asset</DialogTitle>
            <DialogDescription>
              Asset tags are unique and cannot be reused.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="as-tag">Asset Tag</Label>
                <Input
                  id="as-tag"
                  value={form.assetTag}
                  onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
                  placeholder="HYL-IT-0042"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="as-name">Name</Label>
                <Input
                  id="as-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Dell Latitude 5540"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="as-cat">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="as-cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="as-make">Make</Label>
                <Input
                  id="as-make"
                  value={form.make}
                  onChange={(e) => setForm({ ...form, make: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="as-model">Model</Label>
                <Input
                  id="as-model"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="as-serial">Serial Number</Label>
                <Input
                  id="as-serial"
                  value={form.serialNumber}
                  onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="as-cond">Condition</Label>
                <Select
                  value={form.condition}
                  onValueChange={(v) => setForm({ ...form, condition: v })}
                >
                  <SelectTrigger id="as-cond">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="as-pdate">Purchase Date</Label>
                <Input
                  id="as-pdate"
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="as-cost">Purchase Cost</Label>
                <Input
                  id="as-cost"
                  type="number"
                  value={form.purchaseCost}
                  onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="as-warranty">Warranty Until</Label>
                <Input
                  id="as-warranty"
                  type="date"
                  value={form.warrantyUntil}
                  onChange={(e) => setForm({ ...form, warrantyUntil: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="as-branch">Branch</Label>
              <Select value={form.branchId} onValueChange={(v) => setForm({ ...form, branchId: v })}>
                <SelectTrigger id="as-branch">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {branches.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="as-notes">Notes</Label>
              <Textarea
                id="as-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign */}
      <Dialog open={Boolean(assignTarget)} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Asset</DialogTitle>
            <DialogDescription>
              {assignTarget && `${assignTarget.assetTag} — ${assignTarget.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-staff">Assign To</Label>
              <Select
                value={assignForm.staffId}
                onValueChange={(v) => setAssignForm({ ...assignForm, staffId: v })}
              >
                <SelectTrigger id="ai-staff">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-due">Due Return Date</Label>
              <Input
                id="ai-due"
                type="date"
                value={assignForm.dueReturnAt}
                onChange={(e) => setAssignForm({ ...assignForm, dueReturnAt: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for an open-ended assignment.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-notes">Notes</Label>
              <Textarea
                id="ai-notes"
                value={assignForm.notes}
                onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmAssign} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return */}
      <Dialog open={Boolean(returnTarget)} onOpenChange={(open) => !open && setReturnTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Return</DialogTitle>
            <DialogDescription>
              {returnTarget &&
                `${returnTarget.assetTag} returning from ${returnTarget.assignedTo}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ar-cond">Condition on Return</Label>
                <Select
                  value={returnForm.returnCondition}
                  onValueChange={(v) => setReturnForm({ ...returnForm, returnCondition: v })}
                >
                  <SelectTrigger id="ar-cond">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ar-status">New Status</Label>
                <Select
                  value={returnForm.newStatus}
                  onValueChange={(v) => setReturnForm({ ...returnForm, newStatus: v })}
                >
                  <SelectTrigger id="ar-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['AVAILABLE', 'MAINTENANCE', 'RETIRED', 'DAMAGED', 'LOST'].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ar-notes">Return Notes</Label>
              <Textarea
                id="ar-notes"
                value={returnForm.returnNotes}
                onChange={(e) => setReturnForm({ ...returnForm, returnNotes: e.target.value })}
                placeholder="Any damage, missing accessories, or observations"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmReturn} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
