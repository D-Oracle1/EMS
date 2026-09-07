/**
 * Attendance Engine
 * Hylink Finance Limited EMS
 *
 * Resolves the shift a staff member is working on a given day and derives
 * lateness, hours worked and overtime from it. A staff member's assigned shift
 * wins; failing that the default shift; failing that the org-wide work-day
 * times held in system configuration.
 */

import { prisma } from './prisma';
import { getConfigMany } from './system-config';

export interface ResolvedShift {
  shiftId: string | null;
  shiftName: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  breakMinutes: number;
  workDays: number[];
}

function parseTime(value: string, fallbackHours: number): { hours: number; minutes: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return { hours: fallbackHours, minutes: 0 };
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** Apply an "HH:mm" time to a date, returning a new Date on the same day. */
export function applyTimeToDate(date: Date, time: string, fallbackHours: number): Date {
  const { hours, minutes } = parseTime(time, fallbackHours);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * The shift in force for a staff member on a date.
 * Falls back through: assigned shift → default shift → system configuration.
 */
export async function resolveShift(staffId: string, date: Date): Promise<ResolvedShift> {
  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      staffId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      shift: { isActive: true },
    },
    orderBy: { effectiveFrom: 'desc' },
    include: { shift: true },
  });

  if (assignment?.shift) {
    const { shift } = assignment;
    return {
      shiftId: shift.id,
      shiftName: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      graceMinutes: shift.graceMinutes,
      breakMinutes: shift.breakMinutes,
      workDays: shift.workDays,
    };
  }

  const defaultShift = await prisma.workShift.findFirst({
    where: { isDefault: true, isActive: true },
  });

  if (defaultShift) {
    return {
      shiftId: defaultShift.id,
      shiftName: defaultShift.name,
      startTime: defaultShift.startTime,
      endTime: defaultShift.endTime,
      graceMinutes: defaultShift.graceMinutes,
      breakMinutes: defaultShift.breakMinutes,
      workDays: defaultShift.workDays,
    };
  }

  // No shift configured — fall back to the organisation-wide settings.
  const config = await getConfigMany([
    'hr.workdayStart',
    'hr.workdayEnd',
    'hr.lateGraceMinutes',
    'hr.workDays',
  ]);

  let workDays: number[];
  try {
    workDays = JSON.parse(config['hr.workDays']);
    if (!Array.isArray(workDays)) workDays = [1, 2, 3, 4, 5];
  } catch {
    workDays = [1, 2, 3, 4, 5];
  }

  return {
    shiftId: null,
    shiftName: 'Standard hours',
    startTime: config['hr.workdayStart'] || '09:00',
    endTime: config['hr.workdayEnd'] || '17:00',
    graceMinutes: Number(config['hr.lateGraceMinutes']) || 0,
    workDays,
    breakMinutes: 60,
  };
}

export interface ClockInAssessment {
  status: 'PRESENT' | 'LATE';
  minutesLate: number;
  shift: ResolvedShift;
  expectedStart: Date;
}

/** Decide whether an arrival counts as late, honouring the shift's grace period. */
export async function assessClockIn(
  staffId: string,
  clockInAt: Date
): Promise<ClockInAssessment> {
  const day = new Date(clockInAt);
  day.setHours(0, 0, 0, 0);

  const shift = await resolveShift(staffId, day);
  const expectedStart = applyTimeToDate(day, shift.startTime, 9);
  const graceCutoff = new Date(expectedStart.getTime() + shift.graceMinutes * 60_000);

  if (clockInAt <= graceCutoff) {
    return { status: 'PRESENT', minutesLate: 0, shift, expectedStart };
  }

  const minutesLate = Math.round((clockInAt.getTime() - expectedStart.getTime()) / 60_000);
  return { status: 'LATE', minutesLate, shift, expectedStart };
}

export interface ClockOutAssessment {
  workedMinutes: number;
  overtimeMinutes: number;
  hoursWorked: number;
  leftEarly: boolean;
}

/** Compute worked time and overtime for a completed day. */
export async function assessClockOut(
  staffId: string,
  clockInAt: Date,
  clockOutAt: Date
): Promise<ClockOutAssessment> {
  const day = new Date(clockInAt);
  day.setHours(0, 0, 0, 0);

  const [shift, config] = await Promise.all([
    resolveShift(staffId, day),
    getConfigMany(['hr.overtimeThresholdMinutes']),
  ]);

  const grossMinutes = Math.max(
    Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60_000),
    0
  );
  // Unpaid break time only comes off once a full break's worth has been worked.
  const workedMinutes = Math.max(
    grossMinutes > shift.breakMinutes ? grossMinutes - shift.breakMinutes : grossMinutes,
    0
  );

  const expectedEnd = applyTimeToDate(day, shift.endTime, 17);
  const threshold = Number(config['hr.overtimeThresholdMinutes']) || 0;

  const minutesPastEnd = Math.round((clockOutAt.getTime() - expectedEnd.getTime()) / 60_000);
  const overtimeMinutes = minutesPastEnd > threshold ? minutesPastEnd : 0;

  return {
    workedMinutes,
    overtimeMinutes,
    hoursWorked: Number((workedMinutes / 60).toFixed(2)),
    leftEarly: clockOutAt < expectedEnd,
  };
}

/** Whether a date is a working day for a staff member (shift days minus holidays). */
export async function isWorkingDay(staffId: string, date: Date): Promise<boolean> {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);

  const shift = await resolveShift(staffId, day);
  if (!shift.workDays.includes(day.getDay())) return false;

  const holiday = await prisma.holiday.findFirst({
    where: { date: day, isWorkingDay: false },
  });
  return !holiday;
}
