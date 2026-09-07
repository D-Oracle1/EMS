'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  CalendarOff,
  CalendarDays,
  Clock,
  Layers,
  Coins,
  Plus,
  Loader2,
  Trash2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  getLeaveTypes,
  createLeaveType,
  updateLeaveType,
  allocateLeaveEntitlements,
  runLeaveCarryForward,
  getHolidays,
  createHoliday,
  deleteHoliday,
  rolloverRecurringHolidays,
  getWorkShifts,
  createWorkShift,
  updateWorkShift,
  getSalaryGrades,
  createSalaryGrade,
  updateSalaryGrade,
  getPayrollComponents,
  createPayrollComponent,
  updatePayrollComponent,
} from '@/actions/hr-config.actions';
import type { SessionUser } from '@/types';

interface SettingsClientProps {
  user: SessionUser;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COMPONENT_TYPES = ['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION'] as const;
const CALC_TYPES = ['FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS'] as const;

export function SettingsClient({ user }: SettingsClientProps) {
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  const [dialog, setDialog] = useState<
    'leaveType' | 'holiday' | 'shift' | 'grade' | 'component' | null
  >(null);

  const [leaveTypeForm, setLeaveTypeForm] = useState({
    code: '',
    name: '',
    defaultDays: '0',
    isPaid: true,
    requiresApproval: true,
    requiresDocument: false,
    carryForward: false,
    maxCarryForwardDays: '0',
    minServiceMonths: '0',
    countsWeekends: false,
    colorHex: '#0ea5e9',
  });

  const [holidayForm, setHolidayForm] = useState({
    name: '',
    date: '',
    isRecurring: true,
    description: '',
  });

  const [shiftForm, setShiftForm] = useState({
    code: '',
    name: '',
    startTime: '08:00',
    endTime: '17:00',
    graceMinutes: '15',
    breakMinutes: '60',
    workDays: [1, 2, 3, 4, 5] as number[],
    isDefault: false,
  });

  const [gradeForm, setGradeForm] = useState({
    code: '',
    name: '',
    level: '10',
    minGross: '',
    maxGross: '',
    annualLeaveDays: '20',
    description: '',
  });

  const [componentForm, setComponentForm] = useState({
    code: '',
    name: '',
    type: 'EARNING',
    calculationType: 'FIXED',
    defaultValue: '0',
    isTaxable: true,
    isPensionable: false,
    glAccountCode: '',
    sortOrder: '0',
  });

  const canManage =
    user.permissions.includes('HR:CONFIG_MANAGE') ||
    user.permissions.includes('SYSTEM:CONFIG_MANAGE');

  function load() {
    startTransition(async () => {
      try {
        const [lt, h, s, g, c] = await Promise.all([
          getLeaveTypes(true),
          getHolidays(new Date().getFullYear()),
          getWorkShifts(true),
          getSalaryGrades(true),
          getPayrollComponents(true),
        ]);
        setLeaveTypes(lt);
        setHolidays(h);
        setShifts(s);
        setGrades(g);
        setComponents(c);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load HR configuration');
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  function run(action: () => Promise<{ success: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        toast.success(result.message);
        setDialog(null);
        load();
      } else {
        toast.error(result.error || 'Action failed');
      }
    });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function saveLeaveType() {
    if (!leaveTypeForm.code.trim() || !leaveTypeForm.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    run(() =>
      createLeaveType({
        code: leaveTypeForm.code,
        name: leaveTypeForm.name,
        defaultDays: parseFloat(leaveTypeForm.defaultDays) || 0,
        isPaid: leaveTypeForm.isPaid,
        requiresApproval: leaveTypeForm.requiresApproval,
        requiresDocument: leaveTypeForm.requiresDocument,
        carryForward: leaveTypeForm.carryForward,
        maxCarryForwardDays: parseFloat(leaveTypeForm.maxCarryForwardDays) || 0,
        minServiceMonths: parseInt(leaveTypeForm.minServiceMonths, 10) || 0,
        countsWeekends: leaveTypeForm.countsWeekends,
        colorHex: leaveTypeForm.colorHex,
      })
    );
  }

  function saveHoliday() {
    if (!holidayForm.name.trim() || !holidayForm.date) {
      toast.error('Name and date are required');
      return;
    }
    run(() =>
      createHoliday({
        name: holidayForm.name,
        date: holidayForm.date,
        isRecurring: holidayForm.isRecurring,
        description: holidayForm.description || undefined,
      })
    );
  }

  function saveShift() {
    if (!shiftForm.code.trim() || !shiftForm.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    if (shiftForm.workDays.length === 0) {
      toast.error('Select at least one working day');
      return;
    }
    run(() =>
      createWorkShift({
        code: shiftForm.code,
        name: shiftForm.name,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        graceMinutes: parseInt(shiftForm.graceMinutes, 10) || 0,
        breakMinutes: parseInt(shiftForm.breakMinutes, 10) || 0,
        workDays: shiftForm.workDays,
        isDefault: shiftForm.isDefault,
      })
    );
  }

  function saveGrade() {
    if (!gradeForm.code.trim() || !gradeForm.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    run(() =>
      createSalaryGrade({
        code: gradeForm.code,
        name: gradeForm.name,
        level: parseInt(gradeForm.level, 10) || 0,
        minGross: parseFloat(gradeForm.minGross) || 0,
        maxGross: parseFloat(gradeForm.maxGross) || 0,
        annualLeaveDays: parseFloat(gradeForm.annualLeaveDays) || 0,
        description: gradeForm.description || undefined,
      })
    );
  }

  function saveComponent() {
    if (!componentForm.code.trim() || !componentForm.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    run(() =>
      createPayrollComponent({
        code: componentForm.code,
        name: componentForm.name,
        type: componentForm.type as any,
        calculationType: componentForm.calculationType as any,
        defaultValue: parseFloat(componentForm.defaultValue) || 0,
        isTaxable: componentForm.isTaxable,
        isPensionable: componentForm.isPensionable,
        glAccountCode: componentForm.glAccountCode || undefined,
        sortOrder: parseInt(componentForm.sortOrder, 10) || 0,
      })
    );
  }

  const year = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Link href="/hr" className="text-sm text-muted-foreground hover:underline">
            Human Resources
          </Link>
          <span className="text-muted-foreground">/</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">HR Configuration</h1>
        <p className="text-muted-foreground">
          The reference data the rest of the HR module is built on.
        </p>
      </div>

      <Tabs defaultValue="leave">
        <TabsList className="flex-wrap">
          <TabsTrigger value="leave">
            <CalendarOff className="mr-2 h-4 w-4" />
            Leave Types
          </TabsTrigger>
          <TabsTrigger value="holidays">
            <CalendarDays className="mr-2 h-4 w-4" />
            Holidays
          </TabsTrigger>
          <TabsTrigger value="shifts">
            <Clock className="mr-2 h-4 w-4" />
            Shifts
          </TabsTrigger>
          <TabsTrigger value="grades">
            <Layers className="mr-2 h-4 w-4" />
            Grades
          </TabsTrigger>
          <TabsTrigger value="components">
            <Coins className="mr-2 h-4 w-4" />
            Pay Components
          </TabsTrigger>
        </TabsList>

        {/* Leave types */}
        <TabsContent value="leave" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Leave Types</CardTitle>
              {canManage && (
                <Button size="sm" onClick={() => setDialog('leaveType')}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Type
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Default Days</TableHead>
                    <TableHead>Rules</TableHead>
                    <TableHead className="text-right">In Use</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaveTypes.map((type) => (
                    <TableRow key={type.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: type.colorHex ?? '#64748b' }}
                          />
                          <div>
                            <div className="font-medium">{type.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {type.code}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{type.defaultDays}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {!type.isPaid && (
                            <Badge variant="secondary" className="text-[10px]">
                              unpaid
                            </Badge>
                          )}
                          {type.requiresDocument && (
                            <Badge variant="outline" className="text-[10px]">
                              document
                            </Badge>
                          )}
                          {type.carryForward && (
                            <Badge variant="outline" className="text-[10px]">
                              carry {type.maxCarryForwardDays}d
                            </Badge>
                          )}
                          {type.minServiceMonths > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {type.minServiceMonths}m service
                            </Badge>
                          )}
                          {type.genderRestriction && (
                            <Badge variant="outline" className="text-[10px]">
                              {type.genderRestriction.toLowerCase()}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {type.requestCount}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={type.isActive}
                          onCheckedChange={(v) =>
                            run(() => updateLeaveType(type.id, { isActive: v }))
                          }
                          disabled={!canManage || isPending}
                          aria-label={`Toggle ${type.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              run(() => allocateLeaveEntitlements(type.id, year))
                            }
                            title={`Allocate ${year} entitlements to all staff`}
                          >
                            <Users className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {leaveTypes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No leave types configured'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {canManage && leaveTypes.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3">
                  <span className="text-sm text-muted-foreground">Year-end housekeeping:</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(() => runLeaveCarryForward(year - 1, year))}
                    disabled={isPending}
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Carry {year - 1} balances into {year}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Holidays */}
        <TabsContent value="holidays" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Holiday Calendar — {year}</CardTitle>
              {canManage && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(() => rolloverRecurringHolidays(year + 1))}
                    disabled={isPending}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Roll into {year + 1}
                  </Button>
                  <Button size="sm" onClick={() => setDialog('holiday')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Holiday
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Holiday</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Recurring</TableHead>
                    <TableHead>Counts as Work Day</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((holiday) => (
                    <TableRow key={holiday.id}>
                      <TableCell>
                        <div className="font-medium">{holiday.name}</div>
                        {holiday.description && (
                          <div className="text-xs text-muted-foreground">
                            {holiday.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(holiday.date)}</TableCell>
                      <TableCell>
                        {holiday.isRecurring ? (
                          <Badge variant="info">Annual</Badge>
                        ) : (
                          <Badge variant="secondary">One-off</Badge>
                        )}
                      </TableCell>
                      <TableCell>{holiday.isWorkingDay ? 'Yes' : 'No'}</TableCell>
                      <TableCell>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => run(() => deleteHoliday(holiday.id))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {holidays.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : `No holidays recorded for ${year}`}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shifts */}
        <TabsContent value="shifts" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Work Shifts</CardTitle>
              {canManage && (
                <Button size="sm" onClick={() => setDialog('shift')}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Shift
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shift</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Working Days</TableHead>
                    <TableHead className="text-right">Grace</TableHead>
                    <TableHead className="text-right">Assigned</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.map((shift) => (
                    <TableRow key={shift.id}>
                      <TableCell>
                        <div className="font-medium">{shift.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{shift.code}</div>
                        {shift.branchName && (
                          <div className="text-xs text-muted-foreground">{shift.branchName}</div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {shift.startTime} – {shift.endTime}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {DAY_NAMES.map((day, index) => (
                            <span
                              key={day}
                              className={`rounded px-1 py-0.5 text-[10px] ${
                                shift.workDays.includes(index)
                                  ? 'bg-primary/15 text-primary'
                                  : 'text-muted-foreground/40'
                              }`}
                            >
                              {day[0]}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {shift.graceMinutes}m
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {shift.assignedCount}
                      </TableCell>
                      <TableCell>
                        {shift.isDefault && <Badge variant="info">Default</Badge>}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={shift.isActive}
                          onCheckedChange={(v) => run(() => updateWorkShift(shift.id, { isActive: v }))}
                          disabled={!canManage || isPending}
                          aria-label={`Toggle ${shift.name}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {shifts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        {isPending
                          ? 'Loading…'
                          : 'No shifts configured — attendance falls back to system working hours'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Grades */}
        <TabsContent value="grades" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Salary Grades</CardTitle>
              {canManage && (
                <Button size="sm" onClick={() => setDialog('grade')}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Grade
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Level</TableHead>
                    <TableHead className="text-right">Gross Band</TableHead>
                    <TableHead className="text-right">Annual Leave</TableHead>
                    <TableHead className="text-right">Staff</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grades.map((grade) => (
                    <TableRow key={grade.id}>
                      <TableCell>
                        <div className="font-medium">{grade.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{grade.code}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{grade.level}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {formatCurrency(grade.minGross)} – {formatCurrency(grade.maxGross)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {grade.annualLeaveDays} days
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{grade.staffCount}</TableCell>
                      <TableCell>
                        <Switch
                          checked={grade.isActive}
                          onCheckedChange={(v) =>
                            run(() => updateSalaryGrade(grade.id, { isActive: v }))
                          }
                          disabled={!canManage || isPending}
                          aria-label={`Toggle ${grade.name}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {grades.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No salary grades configured'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Components */}
        <TabsContent value="components" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Payroll Components</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Basic salary, PAYE, pension, NHF and loss-of-pay are computed by the engine and
                  are not listed here.
                </p>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setDialog('component')}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Component
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Calculation</TableHead>
                    <TableHead className="text-right">Default</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="text-right">In Use</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {components.map((component) => (
                    <TableRow key={component.id}>
                      <TableCell>
                        <div className="font-medium">{component.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {component.code}
                          {component.glAccountCode ? ` → GL ${component.glAccountCode}` : ''}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            component.type === 'EARNING'
                              ? 'success'
                              : component.type === 'DEDUCTION'
                                ? 'error'
                                : 'purple'
                          }
                        >
                          {component.type.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {component.calculationType.replace(/_/g, ' ').toLowerCase()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {component.calculationType === 'FIXED'
                          ? formatCurrency(component.defaultValue)
                          : `${component.defaultValue}%`}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {component.isTaxable && (
                            <Badge variant="outline" className="text-[10px]">
                              taxable
                            </Badge>
                          )}
                          {component.isPensionable && (
                            <Badge variant="outline" className="text-[10px]">
                              pensionable
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {component.usageCount}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={component.isActive}
                          onCheckedChange={(v) =>
                            run(() => updatePayrollComponent(component.id, { isActive: v }))
                          }
                          disabled={!canManage || isPending}
                          aria-label={`Toggle ${component.name}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {components.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                        {isPending ? 'Loading…' : 'No payroll components configured'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}

      <Dialog open={dialog === 'leaveType'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Leave Type</DialogTitle>
            <DialogDescription>
              Allocate entitlements to staff after creating the type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lt-code">Code</Label>
                <Input
                  id="lt-code"
                  value={leaveTypeForm.code}
                  onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, code: e.target.value })}
                  placeholder="SABBATICAL"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lt-name">Name</Label>
                <Input
                  id="lt-name"
                  value={leaveTypeForm.name}
                  onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, name: e.target.value })}
                  placeholder="Sabbatical Leave"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lt-days">Default Days</Label>
                <Input
                  id="lt-days"
                  type="number"
                  value={leaveTypeForm.defaultDays}
                  onChange={(e) =>
                    setLeaveTypeForm({ ...leaveTypeForm, defaultDays: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lt-service">Min Service (months)</Label>
                <Input
                  id="lt-service"
                  type="number"
                  value={leaveTypeForm.minServiceMonths}
                  onChange={(e) =>
                    setLeaveTypeForm({ ...leaveTypeForm, minServiceMonths: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lt-color">Colour</Label>
                <Input
                  id="lt-color"
                  type="color"
                  value={leaveTypeForm.colorHex}
                  onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, colorHex: e.target.value })}
                  className="h-10 p-1"
                />
              </div>
            </div>
            <div className="space-y-3">
              {[
                { key: 'isPaid' as const, label: 'Paid leave' },
                { key: 'requiresApproval' as const, label: 'Requires approval' },
                { key: 'requiresDocument' as const, label: 'Requires a supporting document' },
                { key: 'countsWeekends' as const, label: 'Counts weekends and holidays' },
                { key: 'carryForward' as const, label: 'Unused days carry into the next year' },
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={leaveTypeForm[item.key]}
                    onCheckedChange={(v) => setLeaveTypeForm({ ...leaveTypeForm, [item.key]: v })}
                  />
                  {item.label}
                </label>
              ))}
            </div>
            {leaveTypeForm.carryForward && (
              <div className="space-y-2">
                <Label htmlFor="lt-carry">Maximum Carry-Forward Days</Label>
                <Input
                  id="lt-carry"
                  type="number"
                  value={leaveTypeForm.maxCarryForwardDays}
                  onChange={(e) =>
                    setLeaveTypeForm({ ...leaveTypeForm, maxCarryForwardDays: e.target.value })
                  }
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={saveLeaveType} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'holiday'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Holiday</DialogTitle>
            <DialogDescription>
              Holidays are excluded from working-day counts for leave and payroll.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="h-name">Name</Label>
              <Input
                id="h-name"
                value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                placeholder="Eid al-Fitr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="h-date">Date</Label>
              <Input
                id="h-date"
                type="date"
                value={holidayForm.date}
                onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="h-desc">Description</Label>
              <Input
                id="h-desc"
                value={holidayForm.description}
                onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={holidayForm.isRecurring}
                onCheckedChange={(v) => setHolidayForm({ ...holidayForm, isRecurring: v })}
              />
              Repeats on the same date each year
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={saveHoliday} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'shift'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Work Shift</DialogTitle>
            <DialogDescription>
              Shifts drive lateness and overtime calculations for the staff assigned to them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-code">Code</Label>
                <Input
                  id="s-code"
                  value={shiftForm.code}
                  onChange={(e) => setShiftForm({ ...shiftForm, code: e.target.value })}
                  placeholder="LATE"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-name">Name</Label>
                <Input
                  id="s-name"
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  placeholder="Late Shift"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="s-start">Start</Label>
                <Input
                  id="s-start"
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-end">End</Label>
                <Input
                  id="s-end"
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-grace">Grace (min)</Label>
                <Input
                  id="s-grace"
                  type="number"
                  value={shiftForm.graceMinutes}
                  onChange={(e) => setShiftForm({ ...shiftForm, graceMinutes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-break">Break (min)</Label>
                <Input
                  id="s-break"
                  type="number"
                  value={shiftForm.breakMinutes}
                  onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Working Days</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((day, index) => (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={shiftForm.workDays.includes(index) ? 'default' : 'outline'}
                    onClick={() =>
                      setShiftForm({
                        ...shiftForm,
                        workDays: shiftForm.workDays.includes(index)
                          ? shiftForm.workDays.filter((d) => d !== index)
                          : [...shiftForm.workDays, index].sort(),
                      })
                    }
                    className="h-8 w-12 px-0 text-xs"
                  >
                    {day}
                  </Button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={shiftForm.isDefault}
                onCheckedChange={(v) => setShiftForm({ ...shiftForm, isDefault: v })}
              />
              Make this the default shift for unassigned staff
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={saveShift} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'grade'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Salary Grade</DialogTitle>
            <DialogDescription>
              Grades band pay and can carry their own annual leave entitlement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="g-code">Code</Label>
                <Input
                  id="g-code"
                  value={gradeForm.code}
                  onChange={(e) => setGradeForm({ ...gradeForm, code: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="g-name">Name</Label>
                <Input
                  id="g-name"
                  value={gradeForm.name}
                  onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="g-min">Minimum Gross</Label>
                <Input
                  id="g-min"
                  type="number"
                  value={gradeForm.minGross}
                  onChange={(e) => setGradeForm({ ...gradeForm, minGross: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-max">Maximum Gross</Label>
                <Input
                  id="g-max"
                  type="number"
                  value={gradeForm.maxGross}
                  onChange={(e) => setGradeForm({ ...gradeForm, maxGross: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="g-level">Level</Label>
                <Input
                  id="g-level"
                  type="number"
                  value={gradeForm.level}
                  onChange={(e) => setGradeForm({ ...gradeForm, level: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="g-leave">Annual Leave Days</Label>
                <Input
                  id="g-leave"
                  type="number"
                  value={gradeForm.annualLeaveDays}
                  onChange={(e) => setGradeForm({ ...gradeForm, annualLeaveDays: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-desc">Description</Label>
              <Input
                id="g-desc"
                value={gradeForm.description}
                onChange={(e) => setGradeForm({ ...gradeForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={saveGrade} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'component'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Payroll Component</DialogTitle>
            <DialogDescription>
              Add the component to a staff member&rsquo;s package to have it appear on their payslip.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="c-code">Code</Label>
                <Input
                  id="c-code"
                  value={componentForm.code}
                  onChange={(e) => setComponentForm({ ...componentForm, code: e.target.value })}
                  placeholder="WARDROBE"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-name">Name</Label>
                <Input
                  id="c-name"
                  value={componentForm.name}
                  onChange={(e) => setComponentForm({ ...componentForm, name: e.target.value })}
                  placeholder="Wardrobe Allowance"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="c-type">Type</Label>
                <Select
                  value={componentForm.type}
                  onValueChange={(v) => setComponentForm({ ...componentForm, type: v })}
                >
                  <SelectTrigger id="c-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPONENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-calc">Calculation</Label>
                <Select
                  value={componentForm.calculationType}
                  onValueChange={(v) =>
                    setComponentForm({ ...componentForm, calculationType: v })
                  }
                >
                  <SelectTrigger id="c-calc">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CALC_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace(/_/g, ' ').toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="c-default">
                  Default {componentForm.calculationType === 'FIXED' ? 'Amount' : '%'}
                </Label>
                <Input
                  id="c-default"
                  type="number"
                  value={componentForm.defaultValue}
                  onChange={(e) =>
                    setComponentForm({ ...componentForm, defaultValue: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-gl">GL Account Code</Label>
                <Input
                  id="c-gl"
                  value={componentForm.glAccountCode}
                  onChange={(e) =>
                    setComponentForm({ ...componentForm, glAccountCode: e.target.value })
                  }
                  placeholder="5110"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-sort">Sort Order</Label>
                <Input
                  id="c-sort"
                  type="number"
                  value={componentForm.sortOrder}
                  onChange={(e) => setComponentForm({ ...componentForm, sortOrder: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={componentForm.isTaxable}
                  onCheckedChange={(v) => setComponentForm({ ...componentForm, isTaxable: v })}
                />
                Taxable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={componentForm.isPensionable}
                  onCheckedChange={(v) => setComponentForm({ ...componentForm, isPensionable: v })}
                />
                Pensionable (included in the pension contribution base)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={saveComponent} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
