'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft,
  Plus,
  DoorOpen,
  Loader2,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  getStaffMovements,
  recordStaffMovement,
  getStaffExits,
  initiateStaffExit,
  updateExitClearance,
  finaliseStaffExit,
} from '@/actions/hr-lifecycle.actions';
import { getStaffList } from '@/actions/hr.actions';
import { getDepartments, getBranches, getRoles } from '@/actions/staff.actions';
import { getSalaryGrades } from '@/actions/hr-config.actions';
import type { SessionUser } from '@/types';

interface LifecycleClientProps {
  user: SessionUser;
}

const MOVEMENT_TYPES = [
  'PROMOTION',
  'DEMOTION',
  'TRANSFER',
  'CONFIRMATION',
  'ROLE_CHANGE',
  'DEPARTMENT_CHANGE',
  'SALARY_REVIEW',
  'SUSPENSION',
  'REINSTATEMENT',
  'CONTRACT_RENEWAL',
] as const;

const MOVEMENT_VARIANT: Record<string, any> = {
  PROMOTION: 'success',
  DEMOTION: 'error',
  TRANSFER: 'info',
  CONFIRMATION: 'success',
  ROLE_CHANGE: 'info',
  DEPARTMENT_CHANGE: 'info',
  SALARY_REVIEW: 'purple',
  SUSPENSION: 'error',
  REINSTATEMENT: 'success',
  CONTRACT_RENEWAL: 'secondary',
  EXIT: 'secondary',
};

const CLEARANCE_VARIANT: Record<string, any> = {
  PENDING: 'secondary',
  IN_PROGRESS: 'warning',
  CLEARED: 'success',
  BLOCKED: 'error',
};

const NONE = '__none';

const emptyMovement = {
  staffId: '',
  type: 'PROMOTION',
  effectiveDate: new Date().toISOString().slice(0, 10),
  toRoleId: NONE,
  toDepartmentId: NONE,
  toBranchId: NONE,
  toGradeId: NONE,
  toJobTitle: '',
  reason: '',
  remarks: '',
};

const emptyExit = {
  staffId: '',
  type: 'RESIGNATION',
  noticeDate: new Date().toISOString().slice(0, 10),
  lastWorkingDay: '',
  reason: '',
  detailedReason: '',
  startOffboarding: true,
};

export function LifecycleClient({ user }: LifecycleClientProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [exits, setExits] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);

  const [movementOpen, setMovementOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [clearanceTarget, setClearanceTarget] = useState<any>(null);
  const [movementForm, setMovementForm] = useState(emptyMovement);
  const [exitForm, setExitForm] = useState(emptyExit);
  const [isPending, startTransition] = useTransition();

  const canManage = user.permissions.includes('HR:STAFF_UPDATE');

  function load() {
    startTransition(async () => {
      try {
        const [m, e] = await Promise.all([getStaffMovements(), getStaffExits()]);
        setMovements(m);
        setExits(e);
      } catch (err: any) {
        toast.error(err.message || 'Failed to load lifecycle records');
      }
    });
  }

  useEffect(() => {
    load();
    Promise.all([getStaffList(), getRoles(), getDepartments(), getBranches(), getSalaryGrades()])
      .then(([s, r, d, b, g]) => {
        setStaff(s);
        setRoles(r);
        setDepartments(d);
        setBranches(b);
        setGrades(g);
      })
      .catch(() => undefined);
  }, []);

  const opt = (value: string) => (value === NONE ? undefined : value);

  function submitMovement() {
    if (!movementForm.staffId || !movementForm.reason.trim()) {
      toast.error('Select a staff member and give a reason');
      return;
    }

    startTransition(async () => {
      const result = await recordStaffMovement({
        staffId: movementForm.staffId,
        type: movementForm.type as any,
        effectiveDate: movementForm.effectiveDate,
        toRoleId: opt(movementForm.toRoleId),
        toDepartmentId: opt(movementForm.toDepartmentId),
        toBranchId: opt(movementForm.toBranchId),
        toGradeId: opt(movementForm.toGradeId),
        toJobTitle: movementForm.toJobTitle || undefined,
        reason: movementForm.reason,
        remarks: movementForm.remarks || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        setMovementOpen(false);
        setMovementForm(emptyMovement);
        load();
      } else {
        toast.error(result.error || 'Failed to record the movement');
      }
    });
  }

  function submitExit() {
    if (!exitForm.staffId || !exitForm.lastWorkingDay || !exitForm.reason.trim()) {
      toast.error('Staff member, last working day and reason are required');
      return;
    }

    startTransition(async () => {
      const result = await initiateStaffExit({
        staffId: exitForm.staffId,
        type: exitForm.type as any,
        noticeDate: exitForm.noticeDate,
        lastWorkingDay: exitForm.lastWorkingDay,
        reason: exitForm.reason,
        detailedReason: exitForm.detailedReason || undefined,
        startOffboarding: exitForm.startOffboarding,
      });

      if (result.success) {
        toast.success(result.message);
        setExitOpen(false);
        setExitForm(emptyExit);
        load();
      } else {
        toast.error(result.error || 'Failed to start the exit');
      }
    });
  }

  function toggleClearance(exit: any, field: string, value: boolean) {
    startTransition(async () => {
      const result = await updateExitClearance(exit.id, { [field]: value } as any);
      if (result.success) {
        toast.success(result.message);
        load();
        if (clearanceTarget?.id === exit.id) {
          setClearanceTarget({ ...clearanceTarget, [field]: value });
        }
      } else {
        toast.error(result.error || 'Failed to update clearance');
      }
    });
  }

  function finalise(exit: any) {
    startTransition(async () => {
      const result = await finaliseStaffExit(exit.id);
      if (result.success) {
        toast.success(result.message);
        setClearanceTarget(null);
        load();
      } else {
        toast.error(result.error || 'Failed to finalise the exit');
      }
    });
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Movements & Exits</h1>
          <p className="text-muted-foreground">
            Every change to someone&rsquo;s position, recorded and applied.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setExitOpen(true)}>
              <DoorOpen className="mr-2 h-4 w-4" />
              Start Exit
            </Button>
            <Button onClick={() => setMovementOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Record Movement
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="movements">
        <TabsList>
          <TabsTrigger value="movements">
            Movements
            <Badge variant="secondary" className="ml-2">
              {movements.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="exits">
            Exits
            <Badge variant="secondary" className="ml-2">
              {exits.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Movements */}
        <TabsContent value="movements" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ArrowRightLeft className="h-5 w-5" />
                Staff Movements
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Recorded By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No movements recorded'}
                      </TableCell>
                    </TableRow>
                  )}
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <div className="font-medium">{movement.staffName}</div>
                        <div className="text-xs text-muted-foreground">{movement.employeeId}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={MOVEMENT_VARIANT[movement.type] ?? 'default'}>
                          {movement.type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(movement.effectiveDate)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {movement.toRole && movement.fromRole !== movement.toRole && (
                          <div>
                            {movement.fromRole} → <strong>{movement.toRole}</strong>
                          </div>
                        )}
                        {movement.toDepartment &&
                          movement.fromDepartment !== movement.toDepartment && (
                            <div>
                              {movement.fromDepartment} → <strong>{movement.toDepartment}</strong>
                            </div>
                          )}
                        {movement.toBranch && movement.fromBranch !== movement.toBranch && (
                          <div>
                            {movement.fromBranch ?? '—'} → <strong>{movement.toBranch}</strong>
                          </div>
                        )}
                        {movement.toJobTitle && (
                          <div>
                            {movement.fromJobTitle ?? '—'} → <strong>{movement.toJobTitle}</strong>
                          </div>
                        )}
                        {movement.toSalary != null && (
                          <div className="tabular-nums">
                            {movement.fromSalary != null
                              ? `${formatCurrency(movement.fromSalary)} → `
                              : ''}
                            <strong>{formatCurrency(movement.toSalary)}</strong>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[240px] text-sm">
                        {movement.reason}
                        {movement.remarks && (
                          <div className="text-xs text-muted-foreground">{movement.remarks}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {movement.createdBy}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exits */}
        <TabsContent value="exits" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DoorOpen className="h-5 w-5" />
                Staff Exits
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Last Day</TableHead>
                    <TableHead>Tenure</TableHead>
                    <TableHead>Clearance</TableHead>
                    <TableHead>Rehire</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exits.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No exits recorded'}
                      </TableCell>
                    </TableRow>
                  )}
                  {exits.map((exit) => (
                    <TableRow key={exit.id}>
                      <TableCell>
                        <div className="font-medium">{exit.staffName}</div>
                        <div className="text-xs text-muted-foreground">
                          {exit.employeeId} · {exit.department}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{exit.type.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(exit.lastWorkingDay)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {exit.tenureMonths >= 12
                          ? `${Math.floor(exit.tenureMonths / 12)}y ${exit.tenureMonths % 12}m`
                          : `${exit.tenureMonths}m`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={CLEARANCE_VARIANT[exit.clearanceStatus] ?? 'default'}>
                          {exit.clearanceStatus.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {exit.rehireEligible ? (
                          <Badge variant="success">Eligible</Badge>
                        ) : (
                          <Badge variant="error">Not eligible</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setClearanceTarget(exit)}
                          >
                            Clearance
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

      {/* Record movement */}
      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Staff Movement</DialogTitle>
            <DialogDescription>
              Once the effective date arrives, the change is applied to the staff record
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="m-staff">Staff Member</Label>
                <Select
                  value={movementForm.staffId}
                  onValueChange={(v) => setMovementForm({ ...movementForm, staffId: v })}
                >
                  <SelectTrigger id="m-staff">
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-type">Movement Type</Label>
                <Select
                  value={movementForm.type}
                  onValueChange={(v) => setMovementForm({ ...movementForm, type: v })}
                >
                  <SelectTrigger id="m-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOVEMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-date">Effective Date</Label>
              <Input
                id="m-date"
                type="date"
                value={movementForm.effectiveDate}
                onChange={(e) =>
                  setMovementForm({ ...movementForm, effectiveDate: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="m-role">New Role</Label>
                <Select
                  value={movementForm.toRoleId}
                  onValueChange={(v) => setMovementForm({ ...movementForm, toRoleId: v })}
                >
                  <SelectTrigger id="m-role">
                    <SelectValue placeholder="Unchanged" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unchanged</SelectItem>
                    {roles.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-dept">New Department</Label>
                <Select
                  value={movementForm.toDepartmentId}
                  onValueChange={(v) => setMovementForm({ ...movementForm, toDepartmentId: v })}
                >
                  <SelectTrigger id="m-dept">
                    <SelectValue placeholder="Unchanged" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unchanged</SelectItem>
                    {departments.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="m-branch">New Branch</Label>
                <Select
                  value={movementForm.toBranchId}
                  onValueChange={(v) => setMovementForm({ ...movementForm, toBranchId: v })}
                >
                  <SelectTrigger id="m-branch">
                    <SelectValue placeholder="Unchanged" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unchanged</SelectItem>
                    {branches.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-grade">New Grade</Label>
                <Select
                  value={movementForm.toGradeId}
                  onValueChange={(v) => setMovementForm({ ...movementForm, toGradeId: v })}
                >
                  <SelectTrigger id="m-grade">
                    <SelectValue placeholder="Unchanged" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unchanged</SelectItem>
                    {grades.map((g: any) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-title">New Job Title</Label>
              <Input
                id="m-title"
                value={movementForm.toJobTitle}
                onChange={(e) => setMovementForm({ ...movementForm, toJobTitle: e.target.value })}
                placeholder="Leave blank to keep the current title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="m-reason">Reason</Label>
              <Input
                id="m-reason"
                value={movementForm.reason}
                onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })}
                placeholder="Annual promotion cycle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-remarks">Remarks</Label>
              <Textarea
                id="m-remarks"
                value={movementForm.remarks}
                onChange={(e) => setMovementForm({ ...movementForm, remarks: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitMovement} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Movement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start exit */}
      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start Exit Process</DialogTitle>
            <DialogDescription>
              The staff record stays active until clearance is complete and the exit is finalised.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="e-staff">Staff Member</Label>
              <Select
                value={exitForm.staffId}
                onValueChange={(v) => setExitForm({ ...exitForm, staffId: v })}
              >
                <SelectTrigger id="e-staff">
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
              <Label htmlFor="e-type">Exit Type</Label>
              <Select
                value={exitForm.type}
                onValueChange={(v) => setExitForm({ ...exitForm, type: v })}
              >
                <SelectTrigger id="e-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    'RESIGNATION',
                    'TERMINATION',
                    'RETIREMENT',
                    'CONTRACT_END',
                    'REDUNDANCY',
                    'DEATH',
                    'ABANDONMENT',
                  ].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="e-notice">Notice Date</Label>
                <Input
                  id="e-notice"
                  type="date"
                  value={exitForm.noticeDate}
                  onChange={(e) => setExitForm({ ...exitForm, noticeDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="e-last">Last Working Day</Label>
                <Input
                  id="e-last"
                  type="date"
                  value={exitForm.lastWorkingDay}
                  onChange={(e) => setExitForm({ ...exitForm, lastWorkingDay: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-reason">Reason</Label>
              <Input
                id="e-reason"
                value={exitForm.reason}
                onChange={(e) => setExitForm({ ...exitForm, reason: e.target.value })}
                placeholder="Better opportunity elsewhere"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-detail">Detailed Notes</Label>
              <Textarea
                id="e-detail"
                value={exitForm.detailedReason}
                onChange={(e) => setExitForm({ ...exitForm, detailedReason: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={exitForm.startOffboarding}
                onCheckedChange={(v) => setExitForm({ ...exitForm, startOffboarding: v })}
              />
              Also start the offboarding checklist
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitExit} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clearance */}
      <Dialog
        open={Boolean(clearanceTarget)}
        onOpenChange={(open) => !open && setClearanceTarget(null)}
      >
        <DialogContent>
          {clearanceTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Exit Clearance</DialogTitle>
                <DialogDescription>
                  {clearanceTarget.staffName} · last day{' '}
                  {formatDate(clearanceTarget.lastWorkingDay)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {[
                  { field: 'assetsReturned', label: 'Company assets returned' },
                  { field: 'handoverCompleted', label: 'Handover completed' },
                  { field: 'accessRevoked', label: 'System access revoked' },
                ].map((item) => (
                  <label
                    key={item.field}
                    className="flex items-center justify-between rounded-md border p-3 text-sm"
                  >
                    <span>{item.label}</span>
                    <Switch
                      checked={clearanceTarget[item.field]}
                      onCheckedChange={(v) => toggleClearance(clearanceTarget, item.field, v)}
                      disabled={isPending || clearanceTarget.staffStatus === 'TERMINATED'}
                    />
                  </label>
                ))}

                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Clearance status</span>
                    <Badge variant={CLEARANCE_VARIANT[clearanceTarget.clearanceStatus] ?? 'default'}>
                      {clearanceTarget.clearanceStatus.replace('_', ' ')}
                    </Badge>
                  </div>
                  {clearanceTarget.finalSettlementAmount != null && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-muted-foreground">Final settlement</span>
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(clearanceTarget.finalSettlementAmount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setClearanceTarget(null)}>
                  Close
                </Button>
                {clearanceTarget.clearanceStatus === 'CLEARED' &&
                  clearanceTarget.staffStatus !== 'TERMINATED' && (
                    <Button onClick={() => finalise(clearanceTarget)} disabled={isPending}>
                      {isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Finalise Exit
                    </Button>
                  )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
