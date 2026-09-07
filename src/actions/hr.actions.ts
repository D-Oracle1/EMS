'use server';

import { createHmac } from 'crypto';
import QRCode from 'qrcode';
import { prisma, withTransaction } from '@/lib/prisma';
import { getSession, requirePermission, requireAnyPermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { assessClockIn, assessClockOut, isWorkingDay } from '@/lib/attendance-engine';
import {
  validateLeaveRequest,
  ensureLeaveBalance,
  getStaffLeaveBalances,
  getLeaveYear,
} from '@/lib/leave-engine';
import { getConfigBoolean, getConfigNumber } from '@/lib/system-config';
import type { ActionResult } from '@/types';

// ── Attendance QR helpers ────────────────────────────────────────────────────

function getAttendanceSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET not configured');
  return secret + ':attendance';
}

function buildAttendanceToken(date: string, branchId: string): string {
  const payload = Buffer.from(JSON.stringify({ date, branchId })).toString('base64url');
  const sig = createHmac('sha256', getAttendanceSecret()).update(payload).digest('base64url');
  return `HYLINK-ATT.${payload}.${sig}`;
}

export async function generateAttendanceQR(): Promise<ActionResult<{ qrDataUrl: string; token: string; date: string }>> {
  try {
    const user = await requireAnyPermission(['HR:ATTENDANCE_MANAGE', 'HR:STAFF_UPDATE']);
    const today = new Date().toISOString().slice(0, 10);
    const branchId = user.branchId ?? 'HQ';
    const token = buildAttendanceToken(today, branchId);
    const qrDataUrl = await QRCode.toDataURL(token, {
      width: 300,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    return { success: true, data: { qrDataUrl, token, date: today } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function clockInWithQR(token: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'HYLINK-ATT') {
      return { success: false, error: 'Invalid QR code' };
    }

    const [, payload, sig] = parts;
    const expectedSig = createHmac('sha256', getAttendanceSecret()).update(payload).digest('base64url');
    if (sig !== expectedSig) {
      return { success: false, error: 'QR code signature is invalid' };
    }

    let parsed: { date: string; branchId: string };
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
      return { success: false, error: 'QR code data is malformed' };
    }

    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today) {
      return { success: false, error: "QR code has expired — please scan today's code" };
    }

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findFirst({
      where: { staffId: user.id, date: todayDate },
    });

    if (existing?.clockIn) {
      return { success: false, error: 'Already clocked in today' };
    }

    const now = new Date();
    const { status, minutesLate, shift } = await assessClockIn(user.id, now);

    const attendanceData = {
      clockIn: now,
      status,
      location: 'QR_SCAN',
      shiftId: shift.shiftId,
      minutesLate,
    };

    if (existing) {
      await prisma.attendance.update({ where: { id: existing.id }, data: attendanceData });
    } else {
      await prisma.attendance.create({
        data: { staffId: user.id, date: todayDate, ...attendanceData },
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR', entityType: 'ATTENDANCE',
      description: `Clocked in via QR at ${now.toISOString()} — ${status}${minutesLate > 0 ? ` by ${minutesLate} min` : ''} (${shift.shiftName})`,
    });

    return {
      success: true,
      message: status === 'LATE'
        ? `Clocked in — ${minutesLate} minute(s) late`
        : 'Clocked in successfully',
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function clockIn(location?: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Remote clock-in can be switched off so attendance must come from the office QR.
    const allowRemote = await getConfigBoolean('hr.allowRemoteClockIn');
    if (!allowRemote) {
      return {
        success: false,
        error: 'Manual clock-in is disabled. Scan the office QR code to clock in.',
      };
    }

    const existing = await prisma.attendance.findFirst({
      where: { staffId: user.id, date: today },
    });

    if (existing?.clockIn) {
      return { success: false, error: 'Already clocked in today' };
    }

    const now = new Date();
    const { status, minutesLate, shift } = await assessClockIn(user.id, now);

    const attendanceData = { clockIn: now, status, location, shiftId: shift.shiftId, minutesLate };

    if (existing) {
      await prisma.attendance.update({ where: { id: existing.id }, data: attendanceData });
    } else {
      await prisma.attendance.create({
        data: { staffId: user.id, date: today, ...attendanceData },
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR',
      entityType: 'ATTENDANCE',
      description: `Clocked in at ${now.toISOString()} — ${status}${minutesLate > 0 ? ` by ${minutesLate} min` : ''} (${shift.shiftName})`,
    });

    return {
      success: true,
      message: status === 'LATE'
        ? `Clocked in — ${minutesLate} minute(s) late`
        : 'Clocked in successfully',
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function clockOut(): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findFirst({
      where: { staffId: user.id, date: today },
    });

    if (!attendance?.clockIn) {
      return { success: false, error: 'Not clocked in today' };
    }
    if (attendance.clockOut) {
      return { success: false, error: 'Already clocked out' };
    }

    const now = new Date();
    const { workedMinutes, overtimeMinutes, hoursWorked } = await assessClockOut(
      user.id,
      attendance.clockIn,
      now
    );

    await prisma.attendance.update({
      where: { id: attendance.id },
      data: { clockOut: now, workedMinutes, overtimeMinutes },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR',
      entityType: 'ATTENDANCE', entityId: attendance.id,
      description: `Clocked out at ${now.toISOString()} — ${hoursWorked}h worked${overtimeMinutes > 0 ? `, ${overtimeMinutes} min overtime` : ''}`,
    });

    return {
      success: true,
      message: overtimeMinutes > 0
        ? `Clocked out. ${hoursWorked}h worked, including ${overtimeMinutes} minute(s) overtime.`
        : `Clocked out. Hours worked: ${hoursWorked}`,
      data: { hoursWorked, overtimeMinutes },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getAttendanceStatus() {
  const { user } = await getSession();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const attendance = await prisma.attendance.findFirst({
    where: { staffId: user.id, date: today },
  });

  return {
    status: attendance?.status || null,
    clockIn: attendance?.clockIn,
    clockOut: attendance?.clockOut,
    isClockedIn: !!attendance?.clockIn && !attendance?.clockOut,
  };
}

export async function getAttendanceRecords(filters?: {
  staffId?: string;
  startDate?: string;
  endDate?: string;
}) {
  await requireAnyPermission(['HR:ATTENDANCE_MANAGE', 'HR:STAFF_READ']);

  const where: Record<string, unknown> = {};
  if (filters?.staffId) where.staffId = filters.staffId;
  if (filters?.startDate || filters?.endDate) {
    where.date = {};
    if (filters?.startDate) (where.date as any).gte = new Date(filters.startDate);
    if (filters?.endDate) (where.date as any).lte = new Date(filters.endDate);
  }

  return prisma.attendance.findMany({
    where: where as any,
    include: { staff: { select: { firstName: true, lastName: true, employeeId: true } } },
    orderBy: { date: 'desc' },
    take: 100,
  });
}

/**
 * Submit a leave request. The requested days are held against the staff
 * member's balance as `pendingDays` so two overlapping requests cannot both
 * be approved out of the same entitlement.
 */
export async function requestLeave(data: {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  handoverToId?: string;
  contactDuringLeave?: string;
  attachmentUrl?: string;
}): Promise<ActionResult<{ id: string; days: number }>> {
  try {
    const { user } = await getSession();

    if (!data.reason.trim()) return { success: false, error: 'A reason is required' };

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { success: false, error: 'Enter valid start and end dates' };
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const leaveType = await prisma.leaveType.findUnique({ where: { id: data.leaveTypeId } });
    if (!leaveType) return { success: false, error: 'Leave type not found' };

    if (leaveType.requiresDocument && !data.attachmentUrl?.trim()) {
      return { success: false, error: `${leaveType.name} requires a supporting document` };
    }

    const [allowNegative, minNoticeDays] = await Promise.all([
      getConfigBoolean('hr.allowNegativeLeaveBalance'),
      getConfigNumber('hr.leaveMinNoticeDays'),
    ]);

    const validation = await validateLeaveRequest({
      staffId: user.id,
      leaveTypeId: data.leaveTypeId,
      startDate: start,
      endDate: end,
      allowNegativeBalance: allowNegative,
      minNoticeDays,
    });
    if (!validation.ok) return { success: false, error: validation.error };

    const { days, year } = validation;

    const leave = await withTransaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          staffId: user.id,
          leaveType: leaveType.code,
          leaveTypeId: leaveType.id,
          startDate: start,
          endDate: end,
          days,
          reason: data.reason.trim(),
          handoverToId: data.handoverToId || null,
          contactDuringLeave: data.contactDuringLeave?.trim() || null,
          attachmentUrl: data.attachmentUrl?.trim() || null,
          status: leaveType.requiresApproval ? 'PENDING' : 'APPROVED',
          approvedAt: leaveType.requiresApproval ? null : new Date(),
        },
      });

      // Hold the days: pending while awaiting approval, used if auto-approved.
      if (leaveType.isPaid) {
        const balance = await tx.leaveBalance.findUnique({
          where: { staffId_leaveTypeId_year: { staffId: user.id, leaveTypeId: leaveType.id, year } },
        });
        if (balance) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: leaveType.requiresApproval
              ? { pendingDays: { increment: days } }
              : { usedDays: { increment: days } },
          });
        }
      }

      return created;
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR', entityType: 'LEAVE_REQUEST', entityId: leave.id,
      description: `Leave request: ${leaveType.name}, ${days} day(s) from ${data.startDate} to ${data.endDate}`,
    });

    // Route the request to whoever can approve it.
    if (leaveType.requiresApproval) {
      const staff = await prisma.staff.findUnique({
        where: { id: user.id },
        select: { firstName: true, lastName: true, supervisorId: true },
      });

      const approvers = staff?.supervisorId
        ? [{ id: staff.supervisorId }]
        : await prisma.staff.findMany({
            where: {
              status: 'ACTIVE',
              role: { permissions: { some: { permission: { code: 'HR:LEAVE_MANAGE' } } } },
            },
            select: { id: true },
          });

      for (const approver of approvers) {
        await createNotification({
          userId: approver.id,
          type: 'APPROVAL_REQUIRED',
          title: 'Leave request awaiting your approval',
          message: `${staff?.firstName} ${staff?.lastName} requested ${days} day(s) of ${leaveType.name} from ${start.toDateString()}.`,
          entityType: 'LEAVE_REQUEST',
          entityId: leave.id,
          actionUrl: '/hr/leave',
        });
      }
    }

    return {
      success: true,
      message: leaveType.requiresApproval
        ? `Leave request submitted for ${days} day(s)`
        : `${days} day(s) of ${leaveType.name} recorded`,
      data: { id: leave.id, days },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Approve or reject a request, moving the held days from pending to used (on
 * approval) or releasing them back (on rejection).
 */
export async function approveLeave(
  leaveId: string,
  decision: 'APPROVED' | 'REJECTED',
  comments?: string
): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['HR:LEAVE_MANAGE', 'HR:STAFF_UPDATE']);

    const leave = await prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      include: {
        staff: { select: { firstName: true, lastName: true, supervisorId: true } },
        leaveTypeRef: { select: { id: true, name: true, isPaid: true } },
      },
    });
    if (!leave) return { success: false, error: 'Leave request not found' };
    if (leave.status !== 'PENDING') {
      return { success: false, error: `This request is already ${leave.status.toLowerCase()}` };
    }
    if (leave.staffId === user.id) {
      return { success: false, error: 'You cannot approve your own leave request' };
    }
    if (decision === 'REJECTED' && !comments?.trim()) {
      return { success: false, error: 'A comment is required when rejecting a request' };
    }

    const year = await getLeaveYear(leave.startDate);

    await withTransaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: leaveId },
        data: {
          status: decision,
          approverId: user.id,
          approvedAt: new Date(),
          approverComments: comments?.trim() || null,
        },
      });

      if (leave.leaveTypeId && leave.leaveTypeRef?.isPaid) {
        const balance = await tx.leaveBalance.findUnique({
          where: {
            staffId_leaveTypeId_year: {
              staffId: leave.staffId,
              leaveTypeId: leave.leaveTypeId,
              year,
            },
          },
        });
        if (balance) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data:
              decision === 'APPROVED'
                ? { pendingDays: { decrement: leave.days }, usedDays: { increment: leave.days } }
                : { pendingDays: { decrement: leave.days } },
          });
        }
      }

      // Reflect an in-progress leave on the staff record.
      if (decision === 'APPROVED') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (leave.startDate <= today && leave.endDate >= today) {
          await tx.staff.update({ where: { id: leave.staffId }, data: { status: 'ON_LEAVE' } });
        }
      }
    });

    await auditLog({
      userId: user.id, action: decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      module: 'HR', entityType: 'LEAVE_REQUEST', entityId: leaveId,
      description: `${decision === 'APPROVED' ? 'Approved' : 'Rejected'} ${leave.days} day(s) of ${leave.leaveTypeRef?.name ?? leave.leaveType} for ${leave.staff.firstName} ${leave.staff.lastName}${comments ? `: ${comments.trim()}` : ''}`,
    });

    await createNotification({
      userId: leave.staffId,
      type: decision === 'APPROVED' ? 'INFO' : 'WARNING',
      title: `Leave request ${decision.toLowerCase()}`,
      message: `Your ${leave.days}-day ${leave.leaveTypeRef?.name ?? leave.leaveType} request from ${leave.startDate.toDateString()} was ${decision.toLowerCase()}.${comments ? ` Comment: ${comments.trim()}` : ''}`,
      entityType: 'LEAVE_REQUEST',
      entityId: leaveId,
      actionUrl: '/hr/leave',
    });

    return { success: true, message: `Leave ${decision.toLowerCase()}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Withdraw a request that has not yet been decided, releasing the held days. */
export async function cancelLeaveRequest(leaveId: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const leave = await prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      include: { leaveTypeRef: { select: { isPaid: true, name: true } } },
    });
    if (!leave) return { success: false, error: 'Leave request not found' };
    if (leave.staffId !== user.id) {
      await requireAnyPermission(['HR:LEAVE_MANAGE', 'HR:STAFF_UPDATE']);
    }
    if (leave.status === 'CANCELLED') return { success: false, error: 'This request is already cancelled' };
    if (leave.status === 'REJECTED') return { success: false, error: 'A rejected request cannot be cancelled' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (leave.status === 'APPROVED' && leave.startDate <= today) {
      return { success: false, error: 'Leave that has already started cannot be cancelled' };
    }

    const year = await getLeaveYear(leave.startDate);

    await withTransaction(async (tx) => {
      await tx.leaveRequest.update({ where: { id: leaveId }, data: { status: 'CANCELLED' } });

      if (leave.leaveTypeId && leave.leaveTypeRef?.isPaid) {
        const balance = await tx.leaveBalance.findUnique({
          where: {
            staffId_leaveTypeId_year: {
              staffId: leave.staffId,
              leaveTypeId: leave.leaveTypeId,
              year,
            },
          },
        });
        if (balance) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data:
              leave.status === 'PENDING'
                ? { pendingDays: { decrement: leave.days } }
                : { usedDays: { decrement: leave.days } },
          });
        }
      }
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR', entityType: 'LEAVE_REQUEST', entityId: leaveId,
      description: `Cancelled ${leave.days} day(s) of ${leave.leaveTypeRef?.name ?? leave.leaveType}`,
    });

    return { success: true, message: 'Leave request cancelled' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Leave balances for a staff member — their own, or anyone's with HR rights. */
export async function getLeaveBalances(staffId?: string, year?: number) {
  const { user } = await getSession();

  const targetId = staffId ?? user.id;
  if (targetId !== user.id) {
    await requireAnyPermission(['HR:LEAVE_MANAGE', 'HR:STAFF_READ']);
  }

  return getStaffLeaveBalances(targetId, year ?? new Date().getFullYear());
}

/** Approved leave in a date range — the team leave calendar. */
export async function getLeaveCalendar(startDate: string, endDate: string, departmentId?: string) {
  await requireAnyPermission(['HR:LEAVE_MANAGE', 'HR:STAFF_READ']);

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Enter valid start and end dates');
  }

  const requests = await prisma.leaveRequest.findMany({
    where: {
      status: 'APPROVED',
      startDate: { lte: end },
      endDate: { gte: start },
      ...(departmentId ? { staff: { departmentId } } : {}),
    },
    include: {
      staff: {
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
        },
      },
      leaveTypeRef: { select: { name: true, colorHex: true } },
    },
    orderBy: { startDate: 'asc' },
  });

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  });

  return {
    leave: requests.map((r) => ({
      id: r.id,
      staffId: r.staffId,
      staffName: `${r.staff.firstName} ${r.staff.lastName}`,
      employeeId: r.staff.employeeId,
      department: r.staff.department.name,
      leaveType: r.leaveTypeRef?.name ?? r.leaveType,
      colorHex: r.leaveTypeRef?.colorHex ?? '#64748b',
      startDate: r.startDate,
      endDate: r.endDate,
      days: r.days,
    })),
    holidays: holidays.map((h) => ({
      id: h.id,
      name: h.name,
      date: h.date,
      isWorkingDay: h.isWorkingDay,
    })),
  };
}

export async function getLeaveRequests(filters?: { staffId?: string; status?: string }) {
  const { user } = await getSession();

  const where: Record<string, unknown> = {};
  if (filters?.staffId === 'all') {
    // Manager viewing all staff leaves — require permission
    await requireAnyPermission(['HR:LEAVE_MANAGE', 'HR:STAFF_UPDATE']);
    // No staffId filter — show all
  } else if (filters?.staffId) {
    where.staffId = filters.staffId;
  } else {
    where.staffId = user.id;
  }
  if (filters?.status) where.status = filters.status;

  return prisma.leaveRequest.findMany({
    where: where as any,
    include: {
      staff: { select: { firstName: true, lastName: true, employeeId: true } },
      approver: { select: { firstName: true, lastName: true } },
      leaveTypeRef: { select: { name: true, colorHex: true, isPaid: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getStaffList(filters?: { search?: string; status?: string; departmentId?: string }) {
  await requirePermission('HR:STAFF_READ');

  const where: Record<string, unknown> = { isDeleted: false };
  if (filters?.status) where.status = filters.status;
  if (filters?.departmentId) where.departmentId = filters.departmentId;
  if (filters?.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
      { employeeId: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const staffData = await prisma.staff.findMany({
    where: where as any,
    include: {
      department: { select: { name: true } },
      role: { select: { name: true } },
      branch: { select: { name: true } },
    },
    orderBy: { employeeId: 'asc' },
  });

  // Strip sensitive fields before sending to client
  return staffData.map(({ passwordHash: _, ...rest }) => rest);
}

export async function getHRDashboard() {
  await requirePermission('HR:STAFF_READ');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [activeStaff, totalStaff, presentToday, absentToday, lateToday, onLeave, pendingLeave, byDepartment] = await Promise.all([
    prisma.staff.count({ where: { status: 'ACTIVE' } }),
    prisma.staff.count(),
    prisma.attendance.count({ where: { date: today, status: 'PRESENT' } }),
    prisma.attendance.count({ where: { date: today, status: 'ABSENT' } }),
    prisma.attendance.count({ where: { date: today, status: 'LATE' } }),
    prisma.attendance.count({ where: { date: today, status: 'ON_LEAVE' } }),
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    prisma.staff.groupBy({ by: ['departmentId'], where: { status: 'ACTIVE' }, _count: true }),
  ]);

  return { activeStaff, totalStaff, presentToday, absentToday, lateToday, onLeave, pendingLeave, byDepartment };
}

export async function getMyProfile() {
  const { user } = await getSession();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [staff, recentAttendance, leaveRequests, performanceReviews] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: user.id },
      include: {
        department: { select: { name: true, code: true } },
        role: { select: { name: true, code: true } },
        branch: { select: { name: true } },
        supervisor: { select: { firstName: true, lastName: true, employeeId: true } },
      },
    }),
    prisma.attendance.findMany({
      where: { staffId: user.id, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'desc' },
      take: 30,
    }),
    prisma.leaveRequest.findMany({
      where: { staffId: user.id },
      include: { approver: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.performanceReview.findMany({
      where: { staffId: user.id },
      include: { reviewer: { select: { firstName: true, lastName: true } } },
      orderBy: { reviewDate: 'desc' },
      take: 5,
    }),
  ]);

  if (!staff) throw new Error('Staff record not found');

  return {
    staff: {
      ...staff,
      passwordHash: undefined, // Never expose password
    },
    recentAttendance,
    leaveRequests,
    performanceReviews: performanceReviews.map((r) => ({
      ...r,
      overallRating: r.overallRating.toNumber(),
    })),
  };
}
