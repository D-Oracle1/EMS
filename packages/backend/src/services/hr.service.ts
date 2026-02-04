/**
 * Hylink EMS - HR Service
 * Staff management, attendance, leave, and performance
 */

import { Prisma, StaffStatus, AttendanceStatus, ReviewStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma, withTransaction } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { generateReference } from '../utils/helpers.js';
import { config } from '../config/index.js';
import { NotFoundError, BusinessError } from '../utils/errors.js';
import { PaginatedResult, PaginationParams } from '../types/index.js';

interface CreateStaffInput {
  email: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
  dateOfBirth?: Date;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  nationalId?: string;
  departmentId: string;
  roleId: string;
  branchId?: string;
  supervisorId?: string;
  hireDate?: Date;
}

interface LeaveRequest {
  staffId: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  reason: string;
}

interface StaffFilters {
  departmentId?: string;
  roleId?: string;
  branchId?: string;
  status?: StaffStatus;
  search?: string;
}

export class HRService {
  /**
   * Create new staff member (Onboarding)
   */
  async createStaff(input: CreateStaffInput, createdById: string): Promise<{ id: string; employeeId: string; temporaryPassword: string }> {
    // Check email uniqueness
    const existing = await prisma.staff.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) {
      throw new BusinessError('Email already exists');
    }

    // Generate employee ID
    const employeeId = await generateReference('EMPLOYEE');

    // Generate temporary password
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, config.bcryptRounds);

    const staff = await prisma.staff.create({
      data: {
        employeeId,
        email: input.email.toLowerCase(),
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName,
        phone: input.phone,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        address: input.address,
        emergencyContact: input.emergencyContact,
        nationalId: input.nationalId,
        departmentId: input.departmentId,
        roleId: input.roleId,
        branchId: input.branchId,
        supervisorId: input.supervisorId,
        hireDate: input.hireDate || new Date(),
        status: StaffStatus.ACTIVE,
        mustChangePassword: true,
        createdBy: createdById,
      },
    });

    logger.info('Staff member created', { employeeId, email: input.email });

    return { id: staff.id, employeeId, temporaryPassword };
  }

  /**
   * Update staff member
   */
  async updateStaff(staffId: string, updates: Partial<CreateStaffInput>): Promise<void> {
    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    await prisma.staff.update({
      where: { id: staffId },
      data: {
        ...updates,
        email: updates.email?.toLowerCase(),
      },
    });

    logger.info('Staff member updated', { staffId });
  }

  /**
   * Offboard staff member (Termination)
   */
  async offboardStaff(staffId: string, terminationDate: Date, reason: string): Promise<void> {
    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    await withTransaction(async (tx) => {
      // Update staff status
      await tx.staff.update({
        where: { id: staffId },
        data: {
          status: StaffStatus.TERMINATED,
          terminationDate,
        },
      });

      // Revoke all sessions
      await tx.userSession.updateMany({
        where: { staffId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    logger.info('Staff member offboarded', { staffId, reason });
  }

  /**
   * Get staff with filters
   */
  async getStaff(filters: StaffFilters, pagination: PaginationParams): Promise<PaginatedResult<any>> {
    const { page, limit, sortBy = 'firstName', sortOrder = 'asc' } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.StaffWhereInput = {};

    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.roleId) where.roleId = filters.roleId;
    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.status) where.status = filters.status;

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { employeeId: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          role: { select: { name: true, code: true } },
          department: { select: { name: true, code: true } },
          branch: { select: { name: true, code: true } },
          supervisor: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.staff.count({ where }),
    ]);

    return {
      data: staff,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Clock in
   */
  async clockIn(staffId: string, ipAddress?: string, location?: string): Promise<{ attendanceId: string; clockInTime: Date }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if already clocked in today
    const existing = await prisma.attendance.findUnique({
      where: { staffId_date: { staffId, date: today } },
    });

    if (existing?.clockIn) {
      throw new BusinessError('Already clocked in today');
    }

    const clockInTime = new Date();

    // Determine if late (assuming 9 AM start)
    const lateThreshold = new Date(today);
    lateThreshold.setHours(9, 0, 0, 0);
    const isLate = clockInTime > lateThreshold;

    const attendance = await prisma.attendance.upsert({
      where: { staffId_date: { staffId, date: today } },
      update: {
        clockIn: clockInTime,
        status: isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        ipAddress,
        location,
      },
      create: {
        staffId,
        date: today,
        clockIn: clockInTime,
        status: isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        ipAddress,
        location,
      },
    });

    logger.info('Staff clocked in', { staffId, clockInTime, isLate });

    return { attendanceId: attendance.id, clockInTime };
  }

  /**
   * Clock out
   */
  async clockOut(staffId: string): Promise<{ clockOutTime: Date; hoursWorked: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findUnique({
      where: { staffId_date: { staffId, date: today } },
    });

    if (!attendance) {
      throw new BusinessError('No clock-in record found for today');
    }

    if (!attendance.clockIn) {
      throw new BusinessError('Must clock in before clocking out');
    }

    if (attendance.clockOut) {
      throw new BusinessError('Already clocked out today');
    }

    const clockOutTime = new Date();
    const hoursWorked = (clockOutTime.getTime() - attendance.clockIn.getTime()) / (1000 * 60 * 60);

    await prisma.attendance.update({
      where: { id: attendance.id },
      data: { clockOut: clockOutTime },
    });

    logger.info('Staff clocked out', { staffId, clockOutTime, hoursWorked: hoursWorked.toFixed(2) });

    return { clockOutTime, hoursWorked: Math.round(hoursWorked * 100) / 100 };
  }

  /**
   * Get current attendance status for a staff member
   */
  async getAttendanceStatus(staffId: string): Promise<{
    isClockedIn: boolean;
    clockInTime?: Date;
    clockOutTime?: Date;
    status?: string;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findUnique({
      where: { staffId_date: { staffId, date: today } },
    });

    return {
      isClockedIn: !!attendance?.clockIn && !attendance?.clockOut,
      clockInTime: attendance?.clockIn || undefined,
      clockOutTime: attendance?.clockOut || undefined,
      status: attendance?.status,
    };
  }

  /**
   * Get attendance records with filters
   */
  async getAttendanceRecords(filters: {
    staffId?: string;
    startDate?: Date;
    endDate?: Date;
    branchId?: string;
  }): Promise<any[]> {
    const where: Prisma.AttendanceWhereInput = {};

    if (filters.staffId) {
      where.staffId = filters.staffId;
    }

    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    if (filters.branchId) {
      where.staff = { branchId: filters.branchId };
    }

    return prisma.attendance.findMany({
      where,
      include: {
        staff: { select: { employeeId: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: 'desc' }, { staff: { firstName: 'asc' } }],
    });
  }

  /**
   * Get attendance records (legacy method)
   */
  async getAttendance(
    staffId: string | undefined,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    return this.getAttendanceRecords({ staffId, startDate, endDate });
  }

  /**
   * Request leave
   */
  async requestLeave(input: LeaveRequest): Promise<{ id: string }> {
    const staff = await prisma.staff.findUnique({ where: { id: input.staffId } });
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    // Calculate number of days
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const leave = await prisma.leaveRequest.create({
      data: {
        staffId: input.staffId,
        leaveType: input.leaveType,
        startDate,
        endDate,
        days,
        reason: input.reason,
        status: 'PENDING',
      },
    });

    logger.info('Leave request created', { staffId: input.staffId, leaveType: input.leaveType, days });

    return { id: leave.id };
  }

  /**
   * Get leave requests
   */
  async getLeaveRequests(filters: { staffId?: string; status?: string }): Promise<any[]> {
    const where: Prisma.LeaveRequestWhereInput = {};
    if (filters.staffId) where.staffId = filters.staffId;
    if (filters.status) where.status = filters.status;

    return prisma.leaveRequest.findMany({
      where,
      include: {
        staff: { select: { employeeId: true, firstName: true, lastName: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Approve or reject leave request
   */
  async approveLeave(
    leaveId: string,
    approverId: string,
    decision: 'APPROVED' | 'REJECTED',
    comments?: string
  ): Promise<void> {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!leave) {
      throw new NotFoundError('Leave request not found');
    }

    if (leave.status !== 'PENDING') {
      throw new BusinessError('Leave request already processed');
    }

    await prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: decision,
        approverId,
        approvedAt: new Date(),
        approverComments: comments,
      },
    });

    // If approved, mark attendance as ON_LEAVE for the period
    if (decision === 'APPROVED') {
      const dates: Date[] = [];
      const current = new Date(leave.startDate);
      while (current <= leave.endDate) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }

      for (const date of dates) {
        await prisma.attendance.upsert({
          where: { staffId_date: { staffId: leave.staffId, date } },
          update: { status: AttendanceStatus.ON_LEAVE },
          create: {
            staffId: leave.staffId,
            date,
            status: AttendanceStatus.ON_LEAVE,
          },
        });
      }
    }

    logger.info('Leave request processed', { leaveId, decision, approverId });
  }

  /**
   * Mark absent (batch job)
   */
  async markAbsentees(date: Date): Promise<number> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Get all active staff
    const activeStaff = await prisma.staff.findMany({
      where: { status: StaffStatus.ACTIVE },
      select: { id: true },
    });

    // Get staff who have attendance records for the date
    const presentStaff = await prisma.attendance.findMany({
      where: { date: targetDate },
      select: { staffId: true },
    });

    const presentIds = new Set(presentStaff.map(p => p.staffId));
    const absentStaff = activeStaff.filter(s => !presentIds.has(s.id));

    // Create absent records
    if (absentStaff.length > 0) {
      await prisma.attendance.createMany({
        data: absentStaff.map(s => ({
          staffId: s.id,
          date: targetDate,
          status: AttendanceStatus.ABSENT,
        })),
        skipDuplicates: true,
      });
    }

    logger.info('Marked absentees', { date: targetDate, count: absentStaff.length });

    return absentStaff.length;
  }

  /**
   * Create performance review
   */
  async createPerformanceReview(
    staffId: string,
    reviewerId: string,
    reviewPeriod: string,
    metrics: {
      productivity: number;
      quality: number;
      attendance: number;
      teamwork: number;
      initiative: number;
    },
    comments: {
      strengths?: string;
      areasForImprovement?: string;
      goals?: string;
      comments?: string;
    }
  ): Promise<{ id: string }> {
    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundError('Staff member not found');
    }

    // Calculate overall rating
    const overallRating = (
      metrics.productivity +
      metrics.quality +
      metrics.attendance +
      metrics.teamwork +
      metrics.initiative
    ) / 5;

    const review = await prisma.performanceReview.create({
      data: {
        staffId,
        reviewerId,
        reviewPeriod,
        reviewDate: new Date(),
        productivity: metrics.productivity,
        quality: metrics.quality,
        attendance: metrics.attendance,
        teamwork: metrics.teamwork,
        initiative: metrics.initiative,
        overallRating,
        strengths: comments.strengths,
        areasForImprovement: comments.areasForImprovement,
        goals: comments.goals,
        comments: comments.comments,
        status: ReviewStatus.SUBMITTED,
      },
    });

    logger.info('Performance review created', { staffId, reviewPeriod });

    return { id: review.id };
  }

  /**
   * Get performance reviews
   */
  async getPerformanceReviews(staffId?: string, reviewPeriod?: string): Promise<any[]> {
    const where: Prisma.PerformanceReviewWhereInput = {};
    if (staffId) where.staffId = staffId;
    if (reviewPeriod) where.reviewPeriod = reviewPeriod;

    return prisma.performanceReview.findMany({
      where,
      include: {
        staff: { select: { employeeId: true, firstName: true, lastName: true } },
        reviewer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { reviewDate: 'desc' },
    });
  }

  /**
   * Get HR dashboard stats
   */
  async getDashboardStats(branchId?: string): Promise<{
    totalStaff: number;
    activeStaff: number;
    presentToday: number;
    absentToday: number;
    lateToday: number;
    onLeave: number;
    byDepartment: Array<{ department: string; count: number }>;
  }> {
    const where: Prisma.StaffWhereInput = {};
    if (branchId) where.branchId = branchId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalStaff,
      activeStaff,
      todayAttendance,
      byDept,
    ] = await Promise.all([
      prisma.staff.count({ where }),
      prisma.staff.count({ where: { ...where, status: StaffStatus.ACTIVE } }),
      prisma.attendance.groupBy({
        by: ['status'],
        where: { date: today, staff: where },
        _count: { id: true },
      }),
      prisma.staff.groupBy({
        by: ['departmentId'],
        where: { ...where, status: StaffStatus.ACTIVE },
        _count: { id: true },
      }),
    ]);

    const attendanceMap = todayAttendance.reduce((acc, a) => {
      acc[a.status] = a._count.id;
      return acc;
    }, {} as Record<string, number>);

    // Get department names
    const deptIds = byDept.map(d => d.departmentId);
    const departments = await prisma.department.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, name: true },
    });

    const byDepartment = byDept.map(d => ({
      department: departments.find(dept => dept.id === d.departmentId)?.name || 'Unknown',
      count: d._count.id,
    }));

    return {
      totalStaff,
      activeStaff,
      presentToday: (attendanceMap[AttendanceStatus.PRESENT] || 0) + (attendanceMap[AttendanceStatus.LATE] || 0),
      absentToday: attendanceMap[AttendanceStatus.ABSENT] || 0,
      lateToday: attendanceMap[AttendanceStatus.LATE] || 0,
      onLeave: attendanceMap[AttendanceStatus.ON_LEAVE] || 0,
      byDepartment,
    };
  }

  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
  }
}

export const hrService = new HRService();
