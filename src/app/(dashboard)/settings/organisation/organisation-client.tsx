'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Building2, Network, Plus, Pencil, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  getBranchesDetailed,
  createBranch,
  updateBranch,
  getDepartmentsDetailed,
  deactivateDepartment,
  reactivateDepartment,
} from '@/actions/admin.actions';
import { createDepartment, updateDepartment } from '@/actions/staff.actions';
import type { SessionUser } from '@/types';

interface OrganisationClientProps {
  user: SessionUser;
}

const emptyBranch = { code: '', name: '', address: '', phone: '', email: '' };
const emptyDepartment = { code: '', name: '', description: '' };

export function OrganisationClient({ user }: OrganisationClientProps) {
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branchDialog, setBranchDialog] = useState(false);
  const [deptDialog, setDeptDialog] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState(emptyBranch);
  const [deptForm, setDeptForm] = useState(emptyDepartment);
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('SYSTEM:CONFIG_MANAGE');
  const canManageDepartments =
    canManage || user.permissions.includes('HR:STAFF_UPDATE');

  function load() {
    startTransition(async () => {
      try {
        const [b, d] = await Promise.all([getBranchesDetailed(), getDepartmentsDetailed()]);
        setBranches(b);
        setDepartments(d);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load organisation data');
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  // ── Branches ──────────────────────────────────────────────────────────────
  function openBranchCreate() {
    setBranchForm(emptyBranch);
    setEditingBranchId(null);
    setBranchDialog(true);
  }

  function openBranchEdit(branch: any) {
    setBranchForm({
      code: branch.code,
      name: branch.name,
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      email: branch.email ?? '',
    });
    setEditingBranchId(branch.id);
    setBranchDialog(true);
  }

  function saveBranch() {
    if (!branchForm.name.trim() || (!editingBranchId && !branchForm.code.trim())) {
      toast.error('Branch code and name are required');
      return;
    }

    startTransition(async () => {
      const result = editingBranchId
        ? await updateBranch(editingBranchId, {
            name: branchForm.name,
            address: branchForm.address,
            phone: branchForm.phone,
            email: branchForm.email,
          })
        : await createBranch(branchForm);

      if (result.success) {
        toast.success(result.message);
        setBranchDialog(false);
        load();
      } else {
        toast.error(result.error || 'Failed to save branch');
      }
    });
  }

  function toggleBranch(branch: any) {
    startTransition(async () => {
      const result = await updateBranch(branch.id, { isActive: !branch.isActive });
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to update branch');
      }
    });
  }

  // ── Departments ───────────────────────────────────────────────────────────
  function openDeptCreate() {
    setDeptForm(emptyDepartment);
    setEditingDeptId(null);
    setDeptDialog(true);
  }

  function openDeptEdit(department: any) {
    setDeptForm({
      code: department.code,
      name: department.name,
      description: department.description ?? '',
    });
    setEditingDeptId(department.id);
    setDeptDialog(true);
  }

  function saveDepartment() {
    if (!deptForm.name.trim() || (!editingDeptId && !deptForm.code.trim())) {
      toast.error('Department code and name are required');
      return;
    }

    startTransition(async () => {
      const result = editingDeptId
        ? await updateDepartment(editingDeptId, {
            name: deptForm.name,
            description: deptForm.description,
          })
        : await createDepartment({
            code: deptForm.code,
            name: deptForm.name,
            description: deptForm.description || undefined,
          });

      if (result.success) {
        toast.success(result.message);
        setDeptDialog(false);
        load();
      } else {
        toast.error(result.error || 'Failed to save department');
      }
    });
  }

  function toggleDepartment(department: any) {
    startTransition(async () => {
      const result = department.isActive
        ? await deactivateDepartment(department.id)
        : await reactivateDepartment(department.id);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to update department');
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
            Settings
          </Link>
          <span className="text-muted-foreground">/</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Branches & Departments</h1>
        <p className="text-muted-foreground">
          The organisational structure staff, customers and transactions are attributed to.
        </p>
      </div>

      <Tabs defaultValue="branches">
        <TabsList>
          <TabsTrigger value="branches">
            <Building2 className="mr-2 h-4 w-4" />
            Branches
            <Badge variant="secondary" className="ml-2">
              {branches.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="departments">
            <Network className="mr-2 h-4 w-4" />
            Departments
            <Badge variant="secondary" className="ml-2">
              {departments.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Branches */}
        <TabsContent value="branches" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Branch Network</CardTitle>
              {canManage && (
                <Button size="sm" onClick={openBranchCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Branch
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">Loans</TableHead>
                    <TableHead className="text-right">Savings</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No branches configured'}
                      </TableCell>
                    </TableRow>
                  )}
                  {branches.map((branch) => (
                    <TableRow key={branch.id}>
                      <TableCell>
                        <div className="font-medium">{branch.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{branch.code}</div>
                        {branch.address && (
                          <div className="text-xs text-muted-foreground">{branch.address}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {branch.phone && <div>{branch.phone}</div>}
                        {branch.email && (
                          <div className="text-muted-foreground">{branch.email}</div>
                        )}
                        {!branch.phone && !branch.email && '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{branch.staffCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {branch.customerCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{branch.loanCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {branch.savingsCount}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={branch.isActive}
                          onCheckedChange={() => toggleBranch(branch)}
                          disabled={!canManage || isPending}
                          aria-label={`Toggle ${branch.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <Button size="sm" variant="ghost" onClick={() => openBranchEdit(branch)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Departments */}
        <TabsContent value="departments" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Departments</CardTitle>
              {canManageDepartments && (
                <Button size="sm" onClick={openDeptCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Department
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No departments configured'}
                      </TableCell>
                    </TableRow>
                  )}
                  {departments.map((department) => (
                    <TableRow key={department.id}>
                      <TableCell>
                        <div className="font-medium">{department.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {department.code}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[320px] text-sm text-muted-foreground">
                        {department.description || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1.5 tabular-nums">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {department.staffCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={department.isActive}
                          onCheckedChange={() => toggleDepartment(department)}
                          disabled={!canManageDepartments || isPending}
                          aria-label={`Toggle ${department.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        {canManageDepartments && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDeptEdit(department)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Branch dialog */}
      <Dialog open={branchDialog} onOpenChange={setBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBranchId ? 'Edit Branch' : 'New Branch'}</DialogTitle>
            <DialogDescription>
              {editingBranchId
                ? 'The branch code is fixed once created.'
                : 'Branches scope staff, customers and financial reporting.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch-code">Code</Label>
                <Input
                  id="branch-code"
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                  disabled={Boolean(editingBranchId)}
                  placeholder="IKJ"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-name">Name</Label>
                <Input
                  id="branch-name"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder="Ikeja Branch"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-address">Address</Label>
              <Input
                id="branch-address"
                value={branchForm.address}
                onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch-phone">Phone</Label>
                <Input
                  id="branch-phone"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-email">Email</Label>
                <Input
                  id="branch-email"
                  type="email"
                  value={branchForm.email}
                  onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveBranch} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingBranchId ? 'Save Changes' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Department dialog */}
      <Dialog open={deptDialog} onOpenChange={setDeptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDeptId ? 'Edit Department' : 'New Department'}</DialogTitle>
            <DialogDescription>
              Departments group staff and drive HR reporting and onboarding templates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dept-code">Code</Label>
                <Input
                  id="dept-code"
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                  disabled={Boolean(editingDeptId)}
                  placeholder="OPS"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dept-name">Name</Label>
                <Input
                  id="dept-name"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  placeholder="Operations"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dept-desc">Description</Label>
              <Input
                id="dept-desc"
                value={deptForm.description}
                onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                placeholder="What this department is responsible for"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveDepartment} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingDeptId ? 'Save Changes' : 'Create Department'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
