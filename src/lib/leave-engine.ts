/**
 * Leave Engine
 * Hylink Finance Limited EMS
 *
 * Working-day arithmetic and entitlement bookkeeping for the leave module.
 * The balance ledger keeps three separate figures per staff/type/year:
 *   entitled + carried forward  → what they may take
 *   pending                     → requested but not yet approved
 *   used                        → approved and consumed
 * Available = entitled + carriedForward - used - pending.
 */

import Decimal from 'decimal.js';
import { prisma } from './prisma';
import { getConfigJson } from './system-config';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface LeaveBalanceView {
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  colorHex: string | null;
  year: number;
  entitledDays: number;
  carriedForwardDays: number;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
}

/** Load the configured working days, falling back to Mon–Fri. */
export async function getWorkingDayNumbers(): Promise<number[]> {
  const days = await getConfigJson<number[]>('hr.workDays', [1, 2, 3, 4, 5]);
  return Array.isArray(days) && days.length > 0 ? days : [1, 2, 3, 4, 5];
}

/**
 * Count the leave days between two dates.
 * When `countsWeekends` is false, non-working days and holidays are excluded.
 */
export async function countLeaveDays(
  startDate: Date,
  endDate: Date,
  countsWeekends: boolean
): Promise<number> {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (end < start) return 0;

  if (countsWeekends) {
    const ms = end.getTime() - start.getTime();
    return Math.floor(ms / 86_400_000) + 1;
  }

  const workDays = await getWorkingDayNumbers();
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: end }, isWorkingDay: false },
    select: { date: true },
  });
  const holidayKeys = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    if (workDays.includes(cursor.getDay()) && !holidayKeys.has(key)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** The leave year a date falls in, honouring a non-January year start. */
export async function getLeaveYear(date: Date): Promise<number> {
  const startMonth = Number(
    await getConfigJson<string>('hr.leaveYearStartMonth', '1')
  );
  const month = date.getMonth() + 1;
  if (Number.isFinite(startMonth) && startMonth > 1 && month < startMonth) {
    return date.getFullYear() - 1;
  }
  return date.getFullYear();
}

/**
 * Fetch (creating on first use) the balance row for a staff/type/year.
 * New rows are seeded from the leave type's default entitlement, prorated by
 * the staff member's months of service in their first year.
 */
export async function ensureLeaveBalance(
  staffId: string,
  leaveTypeId: string,
  year: number
) {
  const existing = await prisma.leaveBalance.findUnique({
    where: { staffId_leaveTypeId_year: { staffId, leaveTypeId, year } },
  });
  if (existing) return existing;

  const [leaveType, staff] = await Promise.all([
    prisma.leaveType.findUnique({ where: { id: leaveTypeId } }),
    prisma.staff.findUnique({
      where: { id: staffId },
      select: { hireDate: true, grade: { select: { annualLeaveDays: true } } },
    }),
  ]);
  if (!leaveType || !staff) throw new Error('Leave type or staff not found');

  // A grade-specific annual entitlement overrides the leave type default.
  const gradeDays = staff.grade?.annualLeaveDays
    ? new Decimal(staff.grade.annualLeaveDays.toString())
    : null;
  let entitled =
    gradeDays && gradeDays.gt(0) && leaveType.code === 'ANNUAL'
      ? gradeDays
      : new Decimal(leaveType.defaultDays.toString());

  // Prorate the hire year: full entitlement × remaining months ÷ 12
  const hireYear = staff.hireDate.getFullYear();
  if (hireYear === year) {
    const monthsRemaining = 12 - staff.hireDate.getMonth();
    entitled = entitled.times(monthsRemaining).div(12).toDecimalPlaces(2);
  }

  return prisma.leaveBalance.create({
    data: {
      staffId,
      leaveTypeId,
      year,
      entitledDays: entitled.toNumber(),
    },
  });
}

/** Every leave balance for a staff member in a year, with availability computed. */
export async function getStaffLeaveBalances(
  staffId: string,
  year: number
): Promise<LeaveBalanceView[]> {
  const types = await prisma.leaveType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  const balances = await prisma.leaveBalance.findMany({
    where: { staffId, year },
  });
  const byType = new Map(balances.map((b) => [b.leaveTypeId, b]));

  return types.map((type) => {
    const row = byType.get(type.id);
    const entitled = new Decimal(row?.entitledDays.toString() ?? type.defaultDays.toString());
    const carried = new Decimal(row?.carriedForwardDays.toString() ?? 0);
    const used = new Decimal(row?.usedDays.toString() ?? 0);
    const pending = new Decimal(row?.pendingDays.toString() ?? 0);

    return {
      leaveTypeId: type.id,
      leaveTypeCode: type.code,
      leaveTypeName: type.name,
      colorHex: type.colorHex,
      year,
      entitledDays: entitled.toNumber(),
      carriedForwardDays: carried.toNumber(),
      usedDays: used.toNumber(),
      pendingDays: pending.toNumber(),
      availableDays: entitled.plus(carried).minus(used).minus(pending).toNumber(),
    };
  });
}

/**
 * Validate a leave request against the type's rules and the staff member's
 * balance. Returns the computed day count when the request is acceptable.
 */
export async function validateLeaveRequest(params: {
  staffId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  allowNegativeBalance: boolean;
  minNoticeDays: number;
}): Promise<{ ok: true; days: number; year: number } | { ok: false; error: string }> {
  const { staffId, leaveTypeId, startDate, endDate, allowNegativeBalance, minNoticeDays } = params;

  if (endDate < startDate) {
    return { ok: false, error: 'End date cannot be before the start date' };
  }

  const [leaveType, staff] = await Promise.all([
    prisma.leaveType.findUnique({ where: { id: leaveTypeId } }),
    prisma.staff.findUnique({
      where: { id: staffId },
      select: { hireDate: true, gender: true },
    }),
  ]);

  if (!leaveType) return { ok: false, error: 'Leave type not found' };
  if (!leaveType.isActive) return { ok: false, error: `${leaveType.name} is not currently available` };
  if (!staff) return { ok: false, error: 'Staff not found' };

  // Gender restriction (maternity / paternity)
  if (leaveType.genderRestriction && staff.gender) {
    if (staff.gender.toUpperCase() !== leaveType.genderRestriction.toUpperCase()) {
      return { ok: false, error: `${leaveType.name} is not applicable to this staff member` };
    }
  }

  // Minimum service
  if (leaveType.minServiceMonths > 0) {
    const monthsOfService =
      (Date.now() - staff.hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (monthsOfService < leaveType.minServiceMonths) {
      return {
        ok: false,
        error: `${leaveType.name} requires ${leaveType.minServiceMonths} months of service`,
      };
    }
  }

  // Notice period — waived for types that are inherently unplanned (sick, compassionate)
  const noticeExempt = ['SICK', 'COMPASSIONATE', 'BEREAVEMENT', 'EMERGENCY'];
  if (minNoticeDays > 0 && !noticeExempt.includes(leaveType.code)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const noticeDays = Math.floor((startDate.getTime() - today.getTime()) / 86_400_000);
    if (noticeDays < minNoticeDays) {
      return {
        ok: false,
        error: `${leaveType.name} requires at least ${minNoticeDays} days' notice`,
      };
    }
  }

  const days = await countLeaveDays(startDate, endDate, leaveType.countsWeekends);
  if (days <= 0) {
    return { ok: false, error: 'The selected range contains no working days' };
  }

  if (leaveType.maxConsecutiveDays && days > leaveType.maxConsecutiveDays) {
    return {
      ok: false,
      error: `${leaveType.name} is limited to ${leaveType.maxConsecutiveDays} consecutive days`,
    };
  }

  // Overlapping requests
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      staffId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlap) {
    return { ok: false, error: 'This overlaps an existing leave request' };
  }

  const year = await getLeaveYear(startDate);

  // Balance check — unpaid leave is not balance-backed
  if (leaveType.isPaid && !allowNegativeBalance) {
    const balance = await ensureLeaveBalance(staffId, leaveTypeId, year);
    const available = new Decimal(balance.entitledDays.toString())
      .plus(balance.carriedForwardDays.toString())
      .minus(balance.usedDays.toString())
      .minus(balance.pendingDays.toString());

    if (available.lt(days)) {
      return {
        ok: false,
        error: `Insufficient balance: ${available.toFixed(1)} day(s) available, ${days} requested`,
      };
    }
  }

  return { ok: true, days, year };
}

/**
 * Carry unused entitlement into the next leave year, capped at the leave type's
 * maxCarryForwardDays. Returns the number of balances updated.
 */
export async function carryForwardLeaveBalances(
  fromYear: number,
  toYear: number
): Promise<{ processed: number; skipped: number }> {
  const types = await prisma.leaveType.findMany({
    where: { isActive: true, carryForward: true },
  });
  if (types.length === 0) return { processed: 0, skipped: 0 };

  const typeById = new Map(types.map((t) => [t.id, t]));

  const balances = await prisma.leaveBalance.findMany({
    where: { year: fromYear, leaveTypeId: { in: types.map((t) => t.id) } },
  });

  let processed = 0;
  let skipped = 0;

  for (const balance of balances) {
    const type = typeById.get(balance.leaveTypeId);
    if (!type) continue;

    const unused = new Decimal(balance.entitledDays.toString())
      .plus(balance.carriedForwardDays.toString())
      .minus(balance.usedDays.toString());

    if (unused.lte(0)) {
      skipped++;
      continue;
    }

    const cap = new Decimal(type.maxCarryForwardDays.toString());
    const carried = Decimal.min(unused, cap);
    if (carried.lte(0)) {
      skipped++;
      continue;
    }

    await ensureLeaveBalance(balance.staffId, balance.leaveTypeId, toYear);
    await prisma.leaveBalance.update({
      where: {
        staffId_leaveTypeId_year: {
          staffId: balance.staffId,
          leaveTypeId: balance.leaveTypeId,
          year: toYear,
        },
      },
      data: { carriedForwardDays: carried.toNumber() },
    });
    processed++;
  }

  return { processed, skipped };
}
