'use server';

import { createHmac } from 'crypto';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { getSession, requirePermission, requireAnyPermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
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
    const nineAM = new Date(todayDate);
    nineAM.setHours(9, 0, 0, 0);
    const status = now > nineAM ? 'LATE' : 'PRESENT';

    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: { clockIn: now, status: status as any, location: 'QR_SCAN' },
      });
    } else {
      await prisma.attendance.create({
        data: { staffId: user.id, date: todayDate, clockIn: now, status: status as any, location: 'QR_SCAN' },
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR', entityType: 'ATTENDANCE',
      description: `Clocked in via QR at ${now.toISOString()} — Status: ${status}`,
    });

    return { success: true, message: `Clocked in successfully${status === 'LATE' ? ' (Late)' : ''}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function clockIn(location?: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findFirst({
      where: { staffId: user.id, date: today },
    });

    if (existing?.clockIn) {
      return { success: false, error: 'Already clocked in today' };
    }

    const now = new Date();
    const nineAM = new Date(today);
    nineAM.setHours(9, 0, 0, 0);
    const status = now > nineAM ? 'LATE' : 'PRESENT';

    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: { clockIn: now, status: status as any, location },
      });
    } else {
      await prisma.attendance.create({
        data: { staffId: user.id, date: today, clockIn: now, status: status as any, location },
      });
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR',
      entityType: 'ATTENDANCE',
      description: `Clocked in at ${now.toISOString()} - Status: ${status}`,
    });

    return { success: true, message: 'Clocked in successfully' };
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
    const hoursWorked = (now.getTime() - attendance.clockIn.getTime()) / (1000 * 60 * 60);

    await prisma.attendance.update({
      where: { id: attendance.id },
      data: { clockOut: now },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR',
      entityType: 'ATTENDANCE', entityId: attendance.id,
      description: `Clocked out at ${now.toISOString()} - Hours worked: ${hoursWorked.toFixed(2)}`,
    });

    return { success: true, message: `Clocked out. Hours worked: ${hoursWorked.toFixed(2)}`, data: { hoursWorked } };
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

export async function requestLeave(data: {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const leave = await prisma.leaveRequest.create({
      data: {
        staffId: user.id,
        leaveType: data.leaveType,
        startDate: start,
        endDate: end,
        days,
        reason: data.reason,
      },
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR', entityType: 'LEAVE_REQUEST', entityId: leave.id,
      description: `Leave request: ${data.leaveType} from ${data.startDate} to ${data.endDate}`,
    });

    return { success: true, message: 'Leave request submitted' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function approveLeave(
  leaveId: string,
  decision: 'APPROVED' | 'REJECTED',
  comments?: string
): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['HR:LEAVE_MANAGE', 'HR:STAFF_UPDATE']);

    await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: decision,
        approverId: user.id,
        approvedAt: new Date(),
        approverComments: comments,
      },
    });

    await auditLog({
      userId: user.id, action: decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      module: 'HR', entityType: 'LEAVE_REQUEST', entityId: leaveId,
      description: `Leave request ${decision.toLowerCase()}`,
    });

    return { success: true, message: `Leave ${decision.toLowerCase()}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
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
