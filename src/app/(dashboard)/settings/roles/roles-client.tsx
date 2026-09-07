'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Plus,
  ArrowLeft,
  Save,
  Loader2,
  Users,
  Search,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
  getPermissionMatrix,
  getRolesDetailed,
  createRole,
  updateRole,
  setRolePermissions,
} from '@/actions/admin.actions';
import type { SessionUser } from '@/types';

interface RolesClientProps {
  user: SessionUser;
}

interface PermissionRow {
  id: string;
  code: string;
  action: string;
  description: string | null;
}

interface ModuleGroup {
  module: string;
  permissions: PermissionRow[];
}

interface RoleRow {
  id: string;
  code: string;
  name: string;
  level: number;
  isActive: boolean;
  staffCount: number;
  permissionIds: string[];
}

const emptyRoleForm = {
  code: '',
  name: '',
  description: '',
  level: '10',
  approvalLimit: '',
};

export function RolesClient({ user }: RolesClientProps) {
  const [modules, setModules] = useState<ModuleGroup[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [details, setDetails] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyRoleForm);
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const canManage = user.permissions.includes('SYSTEM:USER_MANAGE');
  const isSuperAdmin = user.roleCode === 'SUPER_ADMIN';

  function load() {
    startTransition(async () => {
      try {
        const [matrix, detailed] = await Promise.all([getPermissionMatrix(), getRolesDetailed()]);
        setModules(matrix.modules);
        setRoles(matrix.roles);
        setDetails(detailed);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load roles');
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;

  useEffect(() => {
    if (selectedRole) setDraftPermissions(new Set(selectedRole.permissionIds));
  }, [selectedRoleId, roles]);

  const isDirty = useMemo(() => {
    if (!selectedRole) return false;
    const original = new Set(selectedRole.permissionIds);
    if (original.size !== draftPermissions.size) return true;
    for (const id of draftPermissions) if (!original.has(id)) return true;
    return false;
  }, [selectedRole, draftPermissions]);

  // A non-super-admin may only grant permissions they themselves hold.
  const heldCodes = useMemo(() => new Set(user.permissions), [user.permissions]);
  const canGrant = (code: string) => isSuperAdmin || heldCodes.has(code);

  const filteredModules = useMemo(() => {
    if (!search.trim()) return modules;
    const needle = search.trim().toLowerCase();
    return modules
      .map((m) => ({
        module: m.module,
        permissions: m.permissions.filter(
          (p) =>
            p.code.toLowerCase().includes(needle) ||
            m.module.toLowerCase().includes(needle) ||
            (p.description ?? '').toLowerCase().includes(needle)
        ),
      }))
      .filter((m) => m.permissions.length > 0);
  }, [modules, search]);

  function togglePermission(id: string) {
    setDraftPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleModule(group: ModuleGroup, on: boolean) {
    setDraftPermissions((prev) => {
      const next = new Set(prev);
      for (const permission of group.permissions) {
        if (!canGrant(permission.code)) continue;
        if (on) next.add(permission.id);
        else next.delete(permission.id);
      }
      return next;
    });
  }

  function savePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    startTransition(async () => {
      const result = await setRolePermissions(selectedRole.id, Array.from(draftPermissions));
      setSaving(false);
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to save permissions');
      }
    });
  }

  function handleCreateRole() {
    const level = parseInt(form.level, 10);
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Role code and name are required');
      return;
    }
    if (!Number.isFinite(level) || level < 0 || level > 100) {
      toast.error('Role level must be between 0 and 100');
      return;
    }

    startTransition(async () => {
      const result = await createRole({
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        level,
        approvalLimit: form.approvalLimit ? parseFloat(form.approvalLimit) : undefined,
        permissionIds: [],
      });
      if (result.success) {
        toast.success(result.message);
        setCreateOpen(false);
        setForm(emptyRoleForm);
        load();
        if (result.data) setSelectedRoleId(result.data.id);
      } else {
        toast.error(result.error || 'Failed to create role');
      }
    });
  }

  function toggleRoleActive(role: RoleRow) {
    startTransition(async () => {
      const result = await updateRole(role.id, { isActive: !role.isActive });
      if (result.success) {
        toast.success(result.message);
        load();
      } else {
        toast.error(result.error || 'Failed to update role');
      }
    });
  }

  // ── Matrix editor ─────────────────────────────────────────────────────────
  if (selectedRole) {
    const detail = details.find((d) => d.id === selectedRole.id);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSelectedRoleId(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              All roles
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{selectedRole.name}</h1>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{selectedRole.code}</span> · level {selectedRole.level} ·{' '}
                {selectedRole.staffCount} staff
                {detail?.approvalLimit
                  ? ` · approves up to ${formatCurrency(detail.approvalLimit)}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{draftPermissions.size} selected</Badge>
            {isDirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraftPermissions(new Set(selectedRole.permissionIds))}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            )}
            <Button onClick={savePermissions} disabled={!canManage || !isDirty || saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save changes
            </Button>
          </div>
        </div>

        {selectedRole.staffCount > 0 && isDirty && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {selectedRole.staffCount} staff member(s) hold this role. Permissions are resolved at
            sign-in, so they will need to sign in again before the change takes effect.
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter permissions…"
            className="pl-9"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {filteredModules.map((group) => {
            const grantable = group.permissions.filter((p) => canGrant(p.code));
            const allOn =
              grantable.length > 0 && grantable.every((p) => draftPermissions.has(p.id));

            return (
              <Card key={group.module}>
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm font-semibold tracking-wide">
                    {group.module}
                  </CardTitle>
                  <Checkbox
                    checked={allOn}
                    onCheckedChange={(checked) => toggleModule(group, Boolean(checked))}
                    disabled={!canManage || grantable.length === 0}
                    aria-label={`Toggle all ${group.module} permissions`}
                  />
                </CardHeader>
                <CardContent className="space-y-1 pb-4">
                  {group.permissions.map((permission) => {
                    const allowed = canGrant(permission.code);
                    return (
                      <label
                        key={permission.id}
                        className={`flex items-start gap-3 rounded-md p-2 text-sm ${
                          allowed ? 'hover:bg-accent/50' : 'opacity-50'
                        }`}
                      >
                        <Checkbox
                          checked={draftPermissions.has(permission.id)}
                          onCheckedChange={() => togglePermission(permission.id)}
                          disabled={!canManage || !allowed}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="font-mono text-xs">{permission.action}</span>
                          {permission.description && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {permission.description}
                            </span>
                          )}
                          {!allowed && (
                            <span className="block text-[11px] text-muted-foreground">
                              You do not hold this permission
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Role list ─────────────────────────────────────────────────────────────
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
          <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions</h1>
          <p className="text-muted-foreground">
            Roles carry the permission set staff inherit at sign-in.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Role
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5" />
            Roles
            <Badge variant="secondary">{roles.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Approval Limit</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {isPending ? 'Loading…' : 'No roles configured'}
                  </TableCell>
                </TableRow>
              )}
              {roles.map((role) => {
                const detail = details.find((d) => d.id === role.id);
                const editable = isSuperAdmin || role.level < user.roleLevel;

                return (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="font-medium">{role.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{role.code}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{role.level}</TableCell>
                    <TableCell className="tabular-nums">
                      {detail?.approvalLimit ? formatCurrency(detail.approvalLimit) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{role.permissionIds.length}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 tabular-nums">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {role.staffCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={role.isActive}
                        onCheckedChange={() => toggleRoleActive(role)}
                        disabled={!canManage || !editable || isPending}
                        aria-label={`Toggle ${role.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedRoleId(role.id)}
                        disabled={!editable}
                      >
                        Permissions
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create role */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Role</DialogTitle>
            <DialogDescription>
              Create the role first, then grant it permissions from the matrix.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role-code">Code</Label>
                <Input
                  id="role-code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="BRANCH_LEAD"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-level">Level (0–100)</Label>
                <Input
                  id="role-level"
                  type="number"
                  min={0}
                  max={100}
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Branch Lead"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-limit">Approval Limit (optional)</Label>
              <Input
                id="role-limit"
                type="number"
                min={0}
                value={form.approvalLimit}
                onChange={(e) => setForm({ ...form, approvalLimit: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-desc">Description</Label>
              <Input
                id="role-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this role is responsible for"
              />
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">
              A role cannot be created at or above your own authority level ({user.roleLevel}), and
              you can only grant permissions you hold yourself.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateRole} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
