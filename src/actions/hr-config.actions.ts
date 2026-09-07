'use server';

/**
 * HR Configuration — Server Actions
 * Hylink Finance Limited EMS
 *
 * The reference data the rest of the HR module is built on: leave types,
 * the holiday calendar, work shifts, salary grades and payroll components.
 */

import { prisma } from '@/lib/prisma';
import { requirePermission, requireAnyPermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { carryForwardLeaveBalances, ensureLeaveBalance } from '@/lib/leave-engine';
import type { ActionResult } from '@/types';

const HR_CONFIG_PERMS = ['HR:CONFIG_MANAGE', 'SYSTEM:CONFIG_MANAGE'];

// ============================================================================
// LEAVE TYPES
// ============================================================================

export async function getLeaveTypes(includeInactive = false) {
  await requireAnyPermission(['HR:LEAVE_MANAGE', 'HR:STAFF_READ', ...HR_CONFIG_PERMS]);

  const types = await prisma.leaveType.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { requests: true, balances: true } } },
  });

  return types.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    defaultDays: Number(t.defaultDays),
    isPaid: t.isPaid,
    requiresApproval: t.requiresApproval,
    requiresDocument: t.requiresDocument,
    allowHalfDay: t.allowHalfDay,
    carryForward: t.carryForward,
    maxCarryForwardDays: Number(t.maxCarryForwardDays),
    maxConsecutiveDays: t.maxConsecutiveDays,
    minServiceMonths: t.minServiceMonths,
    genderRestriction: t.genderRestriction,
    countsWeekends: t.countsWeekends,
    colorHex: t.colorHex,
    sortOrder: t.sortOrder,
    isActive: t.isActive,
    requestCount: t._count.requests,
    balanceCount: t._count.balances,
  }));
}

export async function createLeaveType(data: {
  code: string;
  name: string;
  description?: string;
  defaultDays: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
  requiresDocument?: boolean;
  allowHalfDay?: boolean;
  carryForward?: boolean;
  maxCarryForwardDays?: number;
  maxConsecutiveDays?: number;
  minServiceMonths?: number;
  genderRestriction?: 'MALE' | 'FEMALE';
  countsWeekends?: boolean;
  colorHex?: string;
  sortOrder?: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAnyPermission(HR_CONFIG_PERMS);

    const code = data.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!code || !data.name.trim()) {
      return { success: false, error: 'Leave type code and name are required' };
    }
    if (data.defaultDays < 0 || data.defaultDays > 365) {
      return { success: false, error: 'Default days must be between 0 and 365' };
    }
    if (data.carryForward && (data.maxCarryForwardDays ?? 0) <= 0) {
      return { success: false, error: 'Set a carry-forward cap when carry forward is enabled' };
    }

    const existing = await prisma.leaveType.findUnique({ where: { code } });
    if (existing) return { success: false, error: `Leave type ${code} already exists` };

    const type = await prisma.leaveType.create({
      data: {
        code,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        defaultDays: data.defaultDays,
        isPaid: data.isPaid ?? true,
        requiresApproval: data.requiresApproval ?? true,
        requiresDocument: data.requiresDocument ?? false,
        allowHalfDay: data.allowHalfDay ?? false,
        carryForward: data.carryForward ?? false,
        maxCarryForwardDays: data.maxCarryForwardDays ?? 0,
        maxConsecutiveDays: data.maxConsecutiveDays ?? null,
        minServiceMonths: data.minServiceMonths ?? 0,
        genderRestriction: data.genderRestriction ?? null,
        countsWeekends: data.countsWeekends ?? false,
        colorHex: data.colorHex ?? '#64748b',
        sortOrder: data.sortOrder ?? 0,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'LEAVE_TYPE',
      entityId: type.id,
      description: `Created leave type ${data.name} [${code}] with ${data.defaultDays} default days`,
    });

    return { success: true, message: `Leave type "${data.name}" created`, data: { id: type.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateLeaveType(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    defaultDays: number;
    isPaid: boolean;
    requiresApproval: boolean;
    requiresDocument: boolean;
    allowHalfDay: boolean;
    carryForward: boolean;
    maxCarryForwardDays: number;
    maxConsecutiveDays: number | null;
    minServiceMonths: number;
    genderRestriction: string | null;
    countsWeekends: boolean;
    colorHex: string;
    sortOrder: number;
    isActive: boolean;
  }>
): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(HR_CONFIG_PERMS);

    const type = await prisma.leaveType.findUnique({
      where: { id },
      include: { _count: { select: { requests: true } } },
    });
    if (!type) return { success: false, error: 'Leave type not found' };

    if (data.defaultDays !== undefined && (data.defaultDays < 0 || data.defaultDays > 365)) {
      return { success: false, error: 'Default days must be between 0 and 365' };
    }
    if (data.isActive === false) {
      const pending = await prisma.leaveRequest.count({
        where: { leaveTypeId: id, status: 'PENDING' },
      });
      if (pending > 0) {
        return { success: false, error: `${pending} pending request(s) use this type. Resolve them first.` };
      }
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      updates[key] = typeof value === 'string' ? value.trim() || null : value;
    }
    if (data.name !== undefined) updates.name = data.name.trim();

    await prisma.leaveType.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'LEAVE_TYPE',
      entityId: id,
      description: `Updated leave type ${type.name} [${type.code}]`,
      changedFields: Object.keys(updates),
    });

    return { success: true, message: `Leave type "${type.name}" updated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Grant this year's entitlement to every active staff member for one leave
 * type. Existing balances are left untouched so re-running is safe.
 */
export async function allocateLeaveEntitlements(
  leaveTypeId: string,
  year: number
): Promise<ActionResult<{ created: number; existing: number }>> {
  try {
    const user = await requireAnyPermission(['HR:LEAVE_MANAGE', ...HR_CONFIG_PERMS]);

    const type = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!type) return { success: false, error: 'Leave type not found' };

    const staff = await prisma.staff.findMany({
      where: { status: { in: ['ACTIVE', 'ON_LEAVE'] }, isDeleted: false },
      select: { id: true, gender: true },
    });

    let created = 0;
    let existing = 0;

    for (const member of staff) {
      // Respect the type's gender restriction when allocating.
      if (
        type.genderRestriction &&
        member.gender &&
        member.gender.toUpperCase() !== type.genderRestriction.toUpperCase()
      ) {
        continue;
      }

      const before = await prisma.leaveBalance.findUnique({
        where: { staffId_leaveTypeId_year: { staffId: member.id, leaveTypeId, year } },
      });
      if (before) {
        existing++;
        continue;
      }
      await ensureLeaveBalance(member.id, leaveTypeId, year);
      created++;
    }

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'LEAVE_BALANCE',
      description: `Allocated ${type.name} entitlements for ${year}: ${created} created, ${existing} already present`,
    });

    return {
      success: true,
      message: `${created} balance(s) created, ${existing} already existed`,
      data: { created, existing },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function runLeaveCarryForward(
  fromYear: number,
  toYear: number
): Promise<ActionResult<{ processed: number; skipped: number }>> {
  try {
    const user = await requireAnyPermission(['HR:LEAVE_MANAGE', ...HR_CONFIG_PERMS]);

    if (toYear !== fromYear + 1) {
      return { success: false, error: 'Carry forward must run into the immediately following year' };
    }

    const result = await carryForwardLeaveBalances(fromYear, toYear);

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'LEAVE_BALANCE',
      description: `Carried leave balances forward from ${fromYear} to ${toYear}: ${result.processed} carried, ${result.skipped} skipped`,
    });

    return {
      success: true,
      message: `${result.processed} balance(s) carried forward, ${result.skipped} skipped`,
      data: result,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Manual adjustment to a balance, for corrections and TOIL grants. */
export async function adjustLeaveBalance(data: {
  staffId: string;
  leaveTypeId: string;
  year: number;
  entitledDays?: number;
  carriedForwardDays?: number;
  reason: string;
}): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['HR:LEAVE_MANAGE', ...HR_CONFIG_PERMS]);

    if (!data.reason.trim()) return { success: false, error: 'A reason is required for a manual adjustment' };
    if (data.entitledDays === undefined && data.carriedForwardDays === undefined) {
      return { success: false, error: 'Supply at least one figure to adjust' };
    }
    if (
      (data.entitledDays !== undefined && data.entitledDays < 0) ||
      (data.carriedForwardDays !== undefined && data.carriedForwardDays < 0)
    ) {
      return { success: false, error: 'Leave days cannot be negative' };
    }

    const balance = await ensureLeaveBalance(data.staffId, data.leaveTypeId, data.year);

    const updates: Record<string, unknown> = {};
    if (data.entitledDays !== undefined) updates.entitledDays = data.entitledDays;
    if (data.carriedForwardDays !== undefined) updates.carriedForwardDays = data.carriedForwardDays;

    await prisma.leaveBalance.update({ where: { id: balance.id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'LEAVE_BALANCE',
      entityId: balance.id,
      description: `Adjusted leave balance: ${data.reason}`,
      oldValues: {
        entitledDays: Number(balance.entitledDays),
        carriedForwardDays: Number(balance.carriedForwardDays),
      },
      newValues: updates,
    });

    return { success: true, message: 'Leave balance adjusted' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// HOLIDAY CALENDAR
// ============================================================================

export async function getHolidays(year?: number) {
  await requireAnyPermission(['HR:STAFF_READ', 'HR:LEAVE_MANAGE', ...HR_CONFIG_PERMS]);

  const where: Record<string, unknown> = {};
  if (year) {
    where.date = {
      gte: new Date(year, 0, 1),
      lte: new Date(year, 11, 31),
    };
  }

  const holidays = await prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });

  return holidays.map((h) => ({
    id: h.id,
    name: h.name,
    date: h.date,
    isRecurring: h.isRecurring,
    isWorkingDay: h.isWorkingDay,
    description: h.description,
  }));
}

export async function createHoliday(data: {
  name: string;
  date: string;
  isRecurring?: boolean;
  isWorkingDay?: boolean;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAnyPermission(HR_CONFIG_PERMS);

    if (!data.name.trim()) return { success: false, error: 'Holiday name is required' };

    const date = new Date(data.date);
    if (Number.isNaN(date.getTime())) return { success: false, error: 'Enter a valid date' };
    date.setHours(0, 0, 0, 0);

    const existing = await prisma.holiday.findFirst({
      where: { name: data.name.trim(), date },
    });
    if (existing) return { success: false, error: 'That holiday is already on the calendar' };

    const holiday = await prisma.holiday.create({
      data: {
        name: data.name.trim(),
        date,
        isRecurring: data.isRecurring ?? false,
        isWorkingDay: data.isWorkingDay ?? false,
        description: data.description?.trim() || null,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'HOLIDAY',
      entityId: holiday.id,
      description: `Added holiday "${data.name}" on ${date.toISOString().slice(0, 10)}`,
    });

    return { success: true, message: `"${data.name}" added to the calendar`, data: { id: holiday.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(HR_CONFIG_PERMS);

    const holiday = await prisma.holiday.findUnique({ where: { id } });
    if (!holiday) return { success: false, error: 'Holiday not found' };

    await prisma.holiday.delete({ where: { id } });

    await auditLog({
      userId: user.id,
      action: 'DELETE',
      module: 'HR',
      entityType: 'HOLIDAY',
      entityId: id,
      description: `Removed holiday "${holiday.name}" (${holiday.date.toISOString().slice(0, 10)})`,
    });

    return { success: true, message: `"${holiday.name}" removed` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Roll recurring holidays into a target year. */
export async function rolloverRecurringHolidays(
  targetYear: number
): Promise<ActionResult<{ created: number }>> {
  try {
    const user = await requireAnyPermission(HR_CONFIG_PERMS);

    const recurring = await prisma.holiday.findMany({ where: { isRecurring: true } });
    let created = 0;

    for (const holiday of recurring) {
      const date = new Date(targetYear, holiday.date.getMonth(), holiday.date.getDate());
      date.setHours(0, 0, 0, 0);

      const exists = await prisma.holiday.findFirst({ where: { name: holiday.name, date } });
      if (exists) continue;

      await prisma.holiday.create({
        data: {
          name: holiday.name,
          date,
          isRecurring: true,
          isWorkingDay: holiday.isWorkingDay,
          description: holiday.description,
        },
      });
      created++;
    }

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'HOLIDAY',
      description: `Rolled ${created} recurring holiday(ies) into ${targetYear}`,
    });

    return { success: true, message: `${created} holiday(ies) added for ${targetYear}`, data: { created } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// WORK SHIFTS
// ============================================================================

export async function getWorkShifts(includeInactive = false) {
  await requireAnyPermission(['HR:ATTENDANCE_MANAGE', 'HR:STAFF_READ', ...HR_CONFIG_PERMS]);

  const shifts = await prisma.workShift.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      branch: { select: { name: true } },
      _count: { select: { assignments: true } },
    },
  });

  return shifts.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    graceMinutes: s.graceMinutes,
    breakMinutes: s.breakMinutes,
    workDays: s.workDays,
    branchId: s.branchId,
    branchName: s.branch?.name ?? null,
    isDefault: s.isDefault,
    isActive: s.isActive,
    assignedCount: s._count.assignments,
  }));
}

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

export async function createWorkShift(data: {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes?: number;
  breakMinutes?: number;
  workDays: number[];
  branchId?: string;
  isDefault?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAnyPermission(HR_CONFIG_PERMS);

    const code = data.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!code || !data.name.trim()) return { success: false, error: 'Shift code and name are required' };
    if (!TIME_PATTERN.test(data.startTime) || !TIME_PATTERN.test(data.endTime)) {
      return { success: false, error: 'Start and end times must be in HH:mm format' };
    }
    if (data.workDays.length === 0) return { success: false, error: 'Select at least one working day' };
    if (data.workDays.some((d) => d < 0 || d > 6)) {
      return { success: false, error: 'Working days must be between 0 (Sunday) and 6 (Saturday)' };
    }

    const existing = await prisma.workShift.findUnique({ where: { code } });
    if (existing) return { success: false, error: `Shift code ${code} is already in use` };

    // Only one default shift may exist at a time.
    if (data.isDefault) {
      await prisma.workShift.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }

    const shift = await prisma.workShift.create({
      data: {
        code,
        name: data.name.trim(),
        startTime: data.startTime,
        endTime: data.endTime,
        graceMinutes: data.graceMinutes ?? 15,
        breakMinutes: data.breakMinutes ?? 60,
        workDays: Array.from(new Set(data.workDays)).sort(),
        branchId: data.branchId || null,
        isDefault: data.isDefault ?? false,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'WORK_SHIFT',
      entityId: shift.id,
      description: `Created shift ${data.name} [${code}] ${data.startTime}–${data.endTime}`,
    });

    return { success: true, message: `Shift "${data.name}" created`, data: { id: shift.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateWorkShift(
  id: string,
  data: Partial<{
    name: string;
    startTime: string;
    endTime: string;
    graceMinutes: number;
    breakMinutes: number;
    workDays: number[];
    branchId: string | null;
    isDefault: boolean;
    isActive: boolean;
  }>
): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(HR_CONFIG_PERMS);

    const shift = await prisma.workShift.findUnique({ where: { id } });
    if (!shift) return { success: false, error: 'Shift not found' };

    if (data.startTime && !TIME_PATTERN.test(data.startTime)) {
      return { success: false, error: 'Start time must be in HH:mm format' };
    }
    if (data.endTime && !TIME_PATTERN.test(data.endTime)) {
      return { success: false, error: 'End time must be in HH:mm format' };
    }
    if (data.workDays && data.workDays.length === 0) {
      return { success: false, error: 'Select at least one working day' };
    }
    if (data.isActive === false && shift.isDefault) {
      return { success: false, error: 'The default shift cannot be deactivated. Set another default first.' };
    }

    if (data.isDefault) {
      await prisma.workShift.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updates: Record<string, unknown> = { ...data };
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.workDays) updates.workDays = Array.from(new Set(data.workDays)).sort();

    await prisma.workShift.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'WORK_SHIFT',
      entityId: id,
      description: `Updated shift ${shift.name} [${shift.code}]`,
      changedFields: Object.keys(updates),
    });

    return { success: true, message: `Shift "${shift.name}" updated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function assignStaffToShift(data: {
  staffIds: string[];
  shiftId: string;
  effectiveFrom: string;
  effectiveTo?: string;
}): Promise<ActionResult<{ assigned: number }>> {
  try {
    const user = await requireAnyPermission(['HR:ATTENDANCE_MANAGE', ...HR_CONFIG_PERMS]);

    if (data.staffIds.length === 0) return { success: false, error: 'Select at least one staff member' };

    const shift = await prisma.workShift.findUnique({ where: { id: data.shiftId } });
    if (!shift) return { success: false, error: 'Shift not found' };
    if (!shift.isActive) return { success: false, error: 'Cannot assign staff to an inactive shift' };

    const effectiveFrom = new Date(data.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) return { success: false, error: 'Enter a valid start date' };
    effectiveFrom.setHours(0, 0, 0, 0);

    let effectiveTo: Date | null = null;
    if (data.effectiveTo) {
      effectiveTo = new Date(data.effectiveTo);
      if (Number.isNaN(effectiveTo.getTime())) return { success: false, error: 'Enter a valid end date' };
      effectiveTo.setHours(0, 0, 0, 0);
      if (effectiveTo < effectiveFrom) {
        return { success: false, error: 'The end date must be after the start date' };
      }
    }

    // Close any open assignment before opening the new one.
    await prisma.shiftAssignment.updateMany({
      where: { staffId: { in: data.staffIds }, effectiveTo: null },
      data: { effectiveTo: effectiveFrom },
    });

    await prisma.shiftAssignment.createMany({
      data: data.staffIds.map((staffId) => ({
        staffId,
        shiftId: data.shiftId,
        effectiveFrom,
        effectiveTo,
      })),
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'SHIFT_ASSIGNMENT',
      description: `Assigned ${data.staffIds.length} staff to shift ${shift.name} from ${effectiveFrom.toISOString().slice(0, 10)}`,
    });

    return {
      success: true,
      message: `${data.staffIds.length} staff assigned to "${shift.name}"`,
      data: { assigned: data.staffIds.length },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// SALARY GRADES
// ============================================================================

export async function getSalaryGrades(includeInactive = false) {
  await requireAnyPermission(['HR:PAYROLL_MANAGE', 'HR:STAFF_READ', ...HR_CONFIG_PERMS]);

  const grades = await prisma.salaryGrade.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { level: 'desc' },
    include: { _count: { select: { staff: true, compensations: true } } },
  });

  return grades.map((g) => ({
    id: g.id,
    code: g.code,
    name: g.name,
    level: g.level,
    minGross: Number(g.minGross),
    maxGross: Number(g.maxGross),
    annualLeaveDays: Number(g.annualLeaveDays),
    description: g.description,
    isActive: g.isActive,
    staffCount: g._count.staff,
    packageCount: g._count.compensations,
  }));
}

export async function createSalaryGrade(data: {
  code: string;
  name: string;
  level: number;
  minGross: number;
  maxGross: number;
  annualLeaveDays?: number;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAnyPermission(['HR:PAYROLL_MANAGE', ...HR_CONFIG_PERMS]);

    const code = data.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!code || !data.name.trim()) return { success: false, error: 'Grade code and name are required' };
    if (data.minGross < 0) return { success: false, error: 'Minimum gross cannot be negative' };
    if (data.maxGross < data.minGross) {
      return { success: false, error: 'Maximum gross must be greater than or equal to the minimum' };
    }
    if (data.annualLeaveDays !== undefined && (data.annualLeaveDays < 0 || data.annualLeaveDays > 365)) {
      return { success: false, error: 'Annual leave days must be between 0 and 365' };
    }

    const existing = await prisma.salaryGrade.findUnique({ where: { code } });
    if (existing) return { success: false, error: `Grade code ${code} is already in use` };

    const grade = await prisma.salaryGrade.create({
      data: {
        code,
        name: data.name.trim(),
        level: data.level,
        minGross: data.minGross,
        maxGross: data.maxGross,
        annualLeaveDays: data.annualLeaveDays ?? 0,
        description: data.description?.trim() || null,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'SALARY_GRADE',
      entityId: grade.id,
      description: `Created salary grade ${data.name} [${code}] (level ${data.level})`,
    });

    return { success: true, message: `Grade "${data.name}" created`, data: { id: grade.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateSalaryGrade(
  id: string,
  data: Partial<{
    name: string;
    level: number;
    minGross: number;
    maxGross: number;
    annualLeaveDays: number;
    description: string;
    isActive: boolean;
  }>
): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['HR:PAYROLL_MANAGE', ...HR_CONFIG_PERMS]);

    const grade = await prisma.salaryGrade.findUnique({
      where: { id },
      include: { _count: { select: { staff: true } } },
    });
    if (!grade) return { success: false, error: 'Salary grade not found' };

    const minGross = data.minGross ?? Number(grade.minGross);
    const maxGross = data.maxGross ?? Number(grade.maxGross);
    if (maxGross < minGross) {
      return { success: false, error: 'Maximum gross must be greater than or equal to the minimum' };
    }
    if (data.isActive === false && grade._count.staff > 0) {
      return {
        success: false,
        error: `${grade._count.staff} staff member(s) are on this grade. Reassign them first.`,
      };
    }

    const updates: Record<string, unknown> = { ...data };
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description.trim() || null;

    await prisma.salaryGrade.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'SALARY_GRADE',
      entityId: id,
      description: `Updated salary grade ${grade.name} [${grade.code}]`,
      changedFields: Object.keys(updates),
    });

    return { success: true, message: `Grade "${grade.name}" updated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// PAYROLL COMPONENTS
// ============================================================================

export async function getPayrollComponents(includeInactive = false) {
  await requireAnyPermission(['HR:PAYROLL_MANAGE', ...HR_CONFIG_PERMS]);

  const components = await prisma.payrollComponent.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    include: { _count: { select: { compensationItems: true } } },
  });

  return components.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    type: c.type,
    calculationType: c.calculationType,
    defaultValue: Number(c.defaultValue),
    isTaxable: c.isTaxable,
    isStatutory: c.isStatutory,
    isPensionable: c.isPensionable,
    glAccountCode: c.glAccountCode,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    description: c.description,
    usageCount: c._count.compensationItems,
  }));
}

export async function createPayrollComponent(data: {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  calculationType: 'FIXED' | 'PERCENT_OF_BASIC' | 'PERCENT_OF_GROSS';
  defaultValue?: number;
  isTaxable?: boolean;
  isStatutory?: boolean;
  isPensionable?: boolean;
  glAccountCode?: string;
  sortOrder?: number;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAnyPermission(['HR:PAYROLL_MANAGE', ...HR_CONFIG_PERMS]);

    const code = data.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!code || !data.name.trim()) return { success: false, error: 'Component code and name are required' };

    // These codes are computed by the payroll engine and must not be shadowed.
    const RESERVED = ['BASIC', 'PAYE', 'PENSION_EE', 'PENSION_ER', 'NHF', 'LOP'];
    if (RESERVED.includes(code)) {
      return { success: false, error: `${code} is a built-in component and cannot be redefined` };
    }

    if (data.defaultValue !== undefined && data.defaultValue < 0) {
      return { success: false, error: 'Default value cannot be negative' };
    }
    if (
      data.calculationType !== 'FIXED' &&
      data.defaultValue !== undefined &&
      data.defaultValue > 100
    ) {
      return { success: false, error: 'A percentage component cannot exceed 100' };
    }

    const existing = await prisma.payrollComponent.findUnique({ where: { code } });
    if (existing) return { success: false, error: `Component code ${code} is already in use` };

    if (data.glAccountCode) {
      const account = await prisma.chartOfAccounts.findUnique({
        where: { accountCode: data.glAccountCode },
      });
      if (!account) return { success: false, error: `GL account ${data.glAccountCode} does not exist` };
    }

    const component = await prisma.payrollComponent.create({
      data: {
        code,
        name: data.name.trim(),
        type: data.type,
        calculationType: data.calculationType,
        defaultValue: data.defaultValue ?? 0,
        isTaxable: data.isTaxable ?? true,
        isStatutory: data.isStatutory ?? false,
        isPensionable: data.isPensionable ?? false,
        glAccountCode: data.glAccountCode || null,
        sortOrder: data.sortOrder ?? 0,
        description: data.description?.trim() || null,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'PAYROLL_COMPONENT',
      entityId: component.id,
      description: `Created payroll component ${data.name} [${code}] (${data.type} / ${data.calculationType})`,
    });

    return { success: true, message: `Component "${data.name}" created`, data: { id: component.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updatePayrollComponent(
  id: string,
  data: Partial<{
    name: string;
    defaultValue: number;
    isTaxable: boolean;
    isPensionable: boolean;
    glAccountCode: string | null;
    sortOrder: number;
    description: string;
    isActive: boolean;
  }>
): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['HR:PAYROLL_MANAGE', ...HR_CONFIG_PERMS]);

    const component = await prisma.payrollComponent.findUnique({
      where: { id },
      include: { _count: { select: { compensationItems: true } } },
    });
    if (!component) return { success: false, error: 'Payroll component not found' };

    if (data.isActive === false && component._count.compensationItems > 0) {
      return {
        success: false,
        error: `${component._count.compensationItems} salary package(s) use this component. Remove it from them first.`,
      };
    }
    if (data.glAccountCode) {
      const account = await prisma.chartOfAccounts.findUnique({
        where: { accountCode: data.glAccountCode },
      });
      if (!account) return { success: false, error: `GL account ${data.glAccountCode} does not exist` };
    }

    const updates: Record<string, unknown> = { ...data };
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description.trim() || null;

    await prisma.payrollComponent.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'PAYROLL_COMPONENT',
      entityId: id,
      description: `Updated payroll component ${component.name} [${component.code}]`,
      changedFields: Object.keys(updates),
    });

    return { success: true, message: `Component "${component.name}" updated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
