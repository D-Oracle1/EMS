'use server';

/**
 * HR Analytics — Server Actions
 * Hylink Finance Limited EMS
 *
 * The workforce intelligence layer: headcount and its composition, attrition,
 * attendance health, leave liability, payroll cost, and the org chart derived
 * from the supervisor graph.
 */

import Decimal from 'decimal.js';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, getSession } from '@/lib/auth-utils';
import { getStaffLeaveBalances } from '@/lib/leave-engine';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const HR_VIEW = ['HR:STAFF_READ', 'HR:ANALYTICS_VIEW', 'HR:PAYROLL_MANAGE'];

// ============================================================================
// HR COMMAND CENTRE
// ============================================================================

export async function getHROverview() {
  await requireAnyPermission(HR_VIEW);

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const [
    headcount,
    byStatus,
    byDepartment,
    byEmploymentType,
    byGender,
    hiresThisYear,
    exitsThisYear,
    attendanceToday,
    pendingLeave,
    onLeaveToday,
    probationEnding,
    contractsExpiring,
    openOpenings,
    activeTrainings,
    assignedAssets,
    pendingOnboarding,
    unacknowledgedNotices,
  ] = await Promise.all([
    prisma.staff.count({ where: { status: { in: ['ACTIVE', 'ON_LEAVE'] }, isDeleted: false } }),
    prisma.staff.groupBy({
      by: ['status'],
      where: { isDeleted: false },
      _count: { _all: true },
    }),
    prisma.staff.groupBy({
      by: ['departmentId'],
      where: { status: { in: ['ACTIVE', 'ON_LEAVE'] }, isDeleted: false },
      _count: { _all: true },
    }),
    prisma.staff.groupBy({
      by: ['employmentType'],
      where: { status: { in: ['ACTIVE', 'ON_LEAVE'] }, isDeleted: false },
      _count: { _all: true },
    }),
    prisma.staff.groupBy({
      by: ['gender'],
      where: { status: { in: ['ACTIVE', 'ON_LEAVE'] }, isDeleted: false },
      _count: { _all: true },
    }),
    prisma.staff.count({ where: { hireDate: { gte: startOfYear }, isDeleted: false } }),
    prisma.staff.count({
      where: { terminationDate: { gte: startOfYear }, status: 'TERMINATED', isDeleted: false },
    }),
    prisma.attendance.groupBy({
      by: ['status'],
      where: { date: today },
      _count: { _all: true },
    }),
    prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
    prisma.leaveRequest.count({
      where: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
    }),
    prisma.staff.count({
      where: {
        status: 'ACTIVE',
        isDeleted: false,
        confirmationDate: null,
        probationEndDate: { gte: today, lte: new Date(today.getTime() + 30 * 86_400_000) },
      },
    }),
    prisma.staff.count({
      where: {
        status: 'ACTIVE',
        isDeleted: false,
        contractEndDate: { gte: today, lte: new Date(today.getTime() + 60 * 86_400_000) },
      },
    }),
    prisma.jobOpening.count({ where: { status: 'OPEN' } }),
    prisma.trainingProgram.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.assetAssignment.count({ where: { returnedAt: null } }),
    prisma.staffOnboarding.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.announcement.count({ where: { isPublished: true, requiresAck: true } }),
  ]);

  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus) statusCounts[row.status] = row._count._all;

  const attendanceCounts: Record<string, number> = {};
  for (const row of attendanceToday) attendanceCounts[row.status] = row._count._all;

  // Attrition = exits ÷ average headcount over the year, annualised.
  const averageHeadcount = headcount + exitsThisYear / 2;
  const attritionRate =
    averageHeadcount > 0
      ? new Decimal(exitsThisYear).div(averageHeadcount).times(100).toDecimalPlaces(1).toNumber()
      : 0;

  const presentToday =
    (attendanceCounts.PRESENT ?? 0) + (attendanceCounts.LATE ?? 0) + (attendanceCounts.HALF_DAY ?? 0);
  const attendanceRate =
    headcount > 0 ? new Decimal(presentToday).div(headcount).times(100).toDecimalPlaces(1).toNumber() : 0;

  return {
    headcount,
    statusCounts,
    hiresThisYear,
    exitsThisYear,
    attritionRate,
    netGrowth: hiresThisYear - exitsThisYear,

    attendanceToday: {
      present: attendanceCounts.PRESENT ?? 0,
      late: attendanceCounts.LATE ?? 0,
      absent: attendanceCounts.ABSENT ?? 0,
      onLeave: onLeaveToday,
      halfDay: attendanceCounts.HALF_DAY ?? 0,
      notClockedIn: Math.max(headcount - presentToday - (attendanceCounts.ABSENT ?? 0) - onLeaveToday, 0),
      attendanceRate,
    },

    departmentDistribution: byDepartment
      .map((d) => ({
        departmentId: d.departmentId,
        department: deptNameById.get(d.departmentId) ?? 'Unknown',
        count: d._count._all,
        percentage:
          headcount > 0
            ? new Decimal(d._count._all).div(headcount).times(100).toDecimalPlaces(1).toNumber()
            : 0,
      }))
      .sort((a, b) => b.count - a.count),

    employmentTypeDistribution: byEmploymentType.map((e) => ({
      type: e.employmentType,
      count: e._count._all,
    })),

    genderDistribution: byGender.map((g) => ({
      gender: g.gender ?? 'Not stated',
      count: g._count._all,
    })),

    actionItems: {
      pendingLeaveRequests: pendingLeave,
      probationEndingSoon: probationEnding,
      contractsExpiringSoon: contractsExpiring,
      openJobOpenings: openOpenings,
      activeTrainings,
      assignedAssets,
      pendingOnboarding,
      noticesRequiringAck: unacknowledgedNotices,
    },
  };
}

/** Monthly hires and exits over the last 12 months, for the trend chart. */
export async function getHeadcountTrend(months = 12) {
  await requireAnyPermission(HR_VIEW);

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const [hires, exits] = await Promise.all([
    prisma.staff.findMany({
      where: { hireDate: { gte: start }, isDeleted: false },
      select: { hireDate: true },
    }),
    prisma.staff.findMany({
      where: { terminationDate: { gte: start }, isDeleted: false },
      select: { terminationDate: true },
    }),
  ]);

  const buckets: Array<{ month: string; label: string; hires: number; exits: number; net: number }> = [];
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    buckets.push({
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleString('en', { month: 'short', year: '2-digit' }),
      hires: 0,
      exits: 0,
      net: 0,
    });
  }
  const byMonth = new Map(buckets.map((b) => [b.month, b]));

  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  for (const h of hires) {
    const bucket = byMonth.get(key(h.hireDate));
    if (bucket) bucket.hires++;
  }
  for (const e of exits) {
    if (!e.terminationDate) continue;
    const bucket = byMonth.get(key(e.terminationDate));
    if (bucket) bucket.exits++;
  }
  for (const bucket of buckets) bucket.net = bucket.hires - bucket.exits;

  return buckets;
}

/** Attendance rate and lateness per department over a window. */
export async function getAttendanceAnalytics(days = 30) {
  await requireAnyPermission([...HR_VIEW, 'HR:ATTENDANCE_MANAGE']);

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const records = await prisma.attendance.findMany({
    where: { date: { gte: since } },
    select: {
      status: true,
      minutesLate: true,
      staff: { select: { id: true, departmentId: true } },
    },
  });

  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]));

  const byDept = new Map<
    string,
    { present: number; late: number; absent: number; onLeave: number; totalLateMinutes: number }
  >();

  for (const record of records) {
    const deptId = record.staff.departmentId;
    if (!byDept.has(deptId)) {
      byDept.set(deptId, { present: 0, late: 0, absent: 0, onLeave: 0, totalLateMinutes: 0 });
    }
    const bucket = byDept.get(deptId)!;
    if (record.status === 'PRESENT' || record.status === 'HALF_DAY') bucket.present++;
    if (record.status === 'LATE') {
      bucket.late++;
      bucket.totalLateMinutes += record.minutesLate;
    }
    if (record.status === 'ABSENT') bucket.absent++;
    if (record.status === 'ON_LEAVE') bucket.onLeave++;
  }

  const rows = Array.from(byDept.entries()).map(([deptId, stats]) => {
    const recorded = stats.present + stats.late + stats.absent;
    const attended = stats.present + stats.late;
    return {
      departmentId: deptId,
      department: deptNameById.get(deptId) ?? 'Unknown',
      present: stats.present,
      late: stats.late,
      absent: stats.absent,
      onLeave: stats.onLeave,
      attendanceRate:
        recorded > 0 ? new Decimal(attended).div(recorded).times(100).toDecimalPlaces(1).toNumber() : 0,
      averageLateMinutes:
        stats.late > 0 ? Math.round(stats.totalLateMinutes / stats.late) : 0,
    };
  });

  // Repeat offenders — the staff most often late in the window.
  const lateByStaff = await prisma.attendance.groupBy({
    by: ['staffId'],
    where: { date: { gte: since }, status: 'LATE' },
    _count: { _all: true },
    orderBy: { _count: { staffId: 'desc' } },
    take: 10,
  });

  const lateStaffIds = lateByStaff.map((l) => l.staffId);
  const lateStaff = lateStaffIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: lateStaffIds } },
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
        },
      })
    : [];
  const staffById = new Map(lateStaff.map((s) => [s.id, s]));

  return {
    periodDays: days,
    byDepartment: rows.sort((a, b) => a.attendanceRate - b.attendanceRate),
    frequentlyLate: lateByStaff
      .map((l) => {
        const staff = staffById.get(l.staffId);
        if (!staff) return null;
        return {
          staffId: l.staffId,
          employeeId: staff.employeeId,
          name: `${staff.firstName} ${staff.lastName}`,
          department: staff.department.name,
          lateCount: l._count._all,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  };
}

/**
 * Outstanding leave liability — days owed across the workforce, and the cash
 * value of that liability where salary data allows it to be priced.
 */
export async function getLeaveLiability(year?: number) {
  await requireAnyPermission([...HR_VIEW, 'HR:LEAVE_MANAGE']);

  const targetYear = year ?? new Date().getFullYear();

  const balances = await prisma.leaveBalance.findMany({
    where: { year: targetYear, leaveType: { isPaid: true } },
    include: {
      leaveType: { select: { name: true, code: true } },
      staff: {
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          status: true,
          department: { select: { name: true } },
          compensations: { where: { isCurrent: true }, select: { basicSalary: true }, take: 1 },
        },
      },
    },
  });

  const active = balances.filter((b) => b.staff.status === 'ACTIVE' || b.staff.status === 'ON_LEAVE');

  let totalDays = new Decimal(0);
  let totalValue = new Decimal(0);
  const byType = new Map<string, { days: Decimal; staffCount: number }>();

  const rows = active.map((b) => {
    const outstanding = new Decimal(b.entitledDays.toString())
      .plus(b.carriedForwardDays.toString())
      .minus(b.usedDays.toString())
      .minus(b.pendingDays.toString());

    const clamped = Decimal.max(outstanding, 0);
    totalDays = totalDays.plus(clamped);

    // Value a day as monthly basic ÷ 22 working days.
    const basic = b.staff.compensations[0]
      ? new Decimal(b.staff.compensations[0].basicSalary.toString())
      : null;
    const value = basic ? basic.div(22).times(clamped).toDecimalPlaces(2) : null;
    if (value) totalValue = totalValue.plus(value);

    const typeName = b.leaveType.name;
    if (!byType.has(typeName)) byType.set(typeName, { days: new Decimal(0), staffCount: 0 });
    const bucket = byType.get(typeName)!;
    bucket.days = bucket.days.plus(clamped);
    if (clamped.gt(0)) bucket.staffCount++;

    return {
      staffId: b.staffId,
      employeeId: b.staff.employeeId,
      name: `${b.staff.firstName} ${b.staff.lastName}`,
      department: b.staff.department.name,
      leaveType: typeName,
      outstandingDays: clamped.toNumber(),
      estimatedValue: value?.toNumber() ?? null,
    };
  });

  return {
    year: targetYear,
    totalOutstandingDays: totalDays.toDecimalPlaces(1).toNumber(),
    totalEstimatedValue: totalValue.toDecimalPlaces(2).toNumber(),
    unpricedStaff: rows.filter((r) => r.estimatedValue === null).length,
    byType: Array.from(byType.entries()).map(([type, stats]) => ({
      leaveType: type,
      days: stats.days.toDecimalPlaces(1).toNumber(),
      staffCount: stats.staffCount,
    })),
    rows: rows.filter((r) => r.outstandingDays > 0).sort((a, b) => b.outstandingDays - a.outstandingDays),
  };
}

/** Payroll cost trend across recent approved runs. */
export async function getPayrollAnalytics(periods = 12) {
  await requireAnyPermission(['HR:PAYROLL_MANAGE', 'HR:ANALYTICS_VIEW']);

  const runs = await prisma.payrollPeriod.findMany({
    where: { status: { in: ['APPROVED', 'PAID'] } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: periods,
  });

  const ordered = [...runs].reverse();

  const trend = ordered.map((p) => ({
    code: p.code,
    year: p.year,
    month: p.month,
    staffCount: p.staffCount,
    gross: Number(p.totalGross),
    deductions: Number(p.totalDeductions),
    net: Number(p.totalNet),
    employerCost: Number(p.totalEmployerCost),
    costToCompany: Number(p.totalGross) + Number(p.totalEmployerCost),
    averageCost: p.staffCount > 0 ? Math.round(Number(p.totalGross) / p.staffCount) : 0,
  }));

  const latest = trend[trend.length - 1] ?? null;
  const previous = trend[trend.length - 2] ?? null;

  // Cost by department on the most recent run.
  let byDepartment: Array<{ department: string; staffCount: number; gross: number }> = [];
  if (latest) {
    const latestRun = ordered[ordered.length - 1];
    const payslips = await prisma.payslip.findMany({
      where: { payrollPeriodId: latestRun.id },
      select: {
        grossEarnings: true,
        staff: { select: { department: { select: { name: true } } } },
      },
    });

    const map = new Map<string, { staffCount: number; gross: Decimal }>();
    for (const slip of payslips) {
      const dept = slip.staff.department.name;
      if (!map.has(dept)) map.set(dept, { staffCount: 0, gross: new Decimal(0) });
      const bucket = map.get(dept)!;
      bucket.staffCount++;
      bucket.gross = bucket.gross.plus(slip.grossEarnings.toString());
    }

    byDepartment = Array.from(map.entries())
      .map(([department, stats]) => ({
        department,
        staffCount: stats.staffCount,
        gross: stats.gross.toDecimalPlaces(2).toNumber(),
      }))
      .sort((a, b) => b.gross - a.gross);
  }

  return {
    trend,
    latest,
    monthOnMonthChange:
      latest && previous && previous.gross > 0
        ? new Decimal(latest.gross - previous.gross)
            .div(previous.gross)
            .times(100)
            .toDecimalPlaces(1)
            .toNumber()
        : null,
    byDepartment,
  };
}

// ============================================================================
// ORG CHART
// ============================================================================

export interface OrgNode {
  id: string;
  employeeId: string;
  name: string;
  jobTitle: string | null;
  roleName: string;
  department: string;
  branch: string | null;
  profilePhoto: string | null;
  status: string;
  directReports: number;
  totalReports: number;
  children: OrgNode[];
}

/**
 * Build the reporting tree from the supervisor graph. Staff whose supervisor is
 * missing (or who form a cycle) are surfaced as additional roots rather than
 * silently dropped.
 */
export async function getOrgChart(rootStaffId?: string): Promise<{
  roots: OrgNode[];
  unassigned: number;
  totalStaff: number;
  maxDepth: number;
}> {
  await requireAnyPermission(HR_VIEW);

  const staff = await prisma.staff.findMany({
    where: { status: { in: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED'] }, isDeleted: false },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      supervisorId: true,
      profilePhoto: true,
      status: true,
      role: { select: { name: true, level: true } },
      department: { select: { name: true } },
      branch: { select: { name: true } },
    },
    orderBy: { role: { level: 'desc' } },
  });

  const byId = new Map(staff.map((s) => [s.id, s]));
  const childrenByParent = new Map<string, string[]>();
  const rootIds: string[] = [];

  for (const member of staff) {
    // Treat a dangling or self-referential supervisor as no supervisor.
    const parentId =
      member.supervisorId && member.supervisorId !== member.id && byId.has(member.supervisorId)
        ? member.supervisorId
        : null;

    if (parentId) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId)!.push(member.id);
    } else {
      rootIds.push(member.id);
    }
  }

  let maxDepth = 0;

  const build = (id: string, depth: number, seen: Set<string>): OrgNode => {
    maxDepth = Math.max(maxDepth, depth);
    const member = byId.get(id)!;

    // A cycle would otherwise recurse forever.
    const nextSeen = new Set(seen).add(id);
    const childIds = (childrenByParent.get(id) ?? []).filter((cid) => !nextSeen.has(cid));
    const children = childIds.map((cid) => build(cid, depth + 1, nextSeen));

    const totalReports = children.reduce((sum, c) => sum + c.totalReports + 1, 0);

    return {
      id: member.id,
      employeeId: member.employeeId,
      name: `${member.firstName} ${member.lastName}`,
      jobTitle: member.jobTitle,
      roleName: member.role.name,
      department: member.department.name,
      branch: member.branch?.name ?? null,
      profilePhoto: member.profilePhoto,
      status: member.status,
      directReports: children.length,
      totalReports,
      children,
    };
  };

  const roots = rootStaffId
    ? byId.has(rootStaffId)
      ? [build(rootStaffId, 0, new Set())]
      : []
    : rootIds.map((id) => build(id, 0, new Set()));

  return {
    roots: roots.sort((a, b) => b.totalReports - a.totalReports),
    unassigned: rootIds.length,
    totalStaff: staff.length,
    maxDepth,
  };
}

// ============================================================================
// THE EMPLOYEE'S OWN HR HOME
// ============================================================================

/** Everything a staff member sees about themselves on the HR self-service page. */
export async function getMyHRSnapshot() {
  const { user } = await getSession();

  const year = new Date().getFullYear();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [staff, leaveBalances, attendanceThisMonth, openGoals, myAssets, myTraining, pendingAcks, myOnboarding] =
    await Promise.all([
      prisma.staff.findUnique({
        where: { id: user.id },
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          hireDate: true,
          confirmationDate: true,
          probationEndDate: true,
          contractEndDate: true,
          employmentType: true,
          profilePhoto: true,
          department: { select: { name: true } },
          branch: { select: { name: true } },
          role: { select: { name: true } },
          grade: { select: { name: true } },
          supervisor: { select: { firstName: true, lastName: true, jobTitle: true } },
          _count: { select: { subordinates: true } },
        },
      }),
      getStaffLeaveBalances(user.id, year),
      prisma.attendance.groupBy({
        by: ['status'],
        where: {
          staffId: user.id,
          date: { gte: new Date(today.getFullYear(), today.getMonth(), 1) },
        },
        _count: { _all: true },
      }),
      prisma.staffGoal.count({ where: { staffId: user.id, status: 'ACTIVE' } }),
      prisma.assetAssignment.count({ where: { staffId: user.id, returnedAt: null } }),
      prisma.trainingEnrollment.count({
        where: { staffId: user.id, status: { in: ['NOMINATED', 'ENROLLED'] } },
      }),
      prisma.announcement.count({
        where: {
          isPublished: true,
          requiresAck: true,
          acknowledgements: { none: { staffId: user.id } },
        },
      }),
      prisma.staffOnboarding.findFirst({
        where: { staffId: user.id, status: 'IN_PROGRESS' },
        include: { tasks: { select: { status: true } } },
      }),
    ]);

  if (!staff) throw new Error('Staff record not found');

  const attendanceCounts: Record<string, number> = {};
  for (const row of attendanceThisMonth) attendanceCounts[row.status] = row._count._all;

  const tenureMonths = Math.floor(
    (Date.now() - staff.hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );

  const onboardingTasks = myOnboarding?.tasks ?? [];
  const onboardingDone = onboardingTasks.filter(
    (t) => t.status === 'COMPLETED' || t.status === 'SKIPPED'
  ).length;

  return {
    profile: {
      employeeId: staff.employeeId,
      name: `${staff.firstName} ${staff.lastName}`,
      jobTitle: staff.jobTitle,
      role: staff.role.name,
      department: staff.department.name,
      branch: staff.branch?.name ?? null,
      grade: staff.grade?.name ?? null,
      employmentType: staff.employmentType,
      profilePhoto: staff.profilePhoto,
      hireDate: staff.hireDate,
      confirmationDate: staff.confirmationDate,
      probationEndDate: staff.probationEndDate,
      contractEndDate: staff.contractEndDate,
      tenureMonths,
      tenureLabel:
        tenureMonths >= 12
          ? `${Math.floor(tenureMonths / 12)}y ${tenureMonths % 12}m`
          : `${tenureMonths}m`,
      supervisor: staff.supervisor
        ? {
            name: `${staff.supervisor.firstName} ${staff.supervisor.lastName}`,
            jobTitle: staff.supervisor.jobTitle,
          }
        : null,
      directReports: staff._count.subordinates,
      isConfirmed: Boolean(staff.confirmationDate),
    },
    leaveBalances,
    attendanceThisMonth: {
      present: attendanceCounts.PRESENT ?? 0,
      late: attendanceCounts.LATE ?? 0,
      absent: attendanceCounts.ABSENT ?? 0,
      onLeave: attendanceCounts.ON_LEAVE ?? 0,
    },
    counters: {
      activeGoals: openGoals,
      assetsHeld: myAssets,
      pendingTraining: myTraining,
      noticesToAcknowledge: pendingAcks,
    },
    onboarding: myOnboarding
      ? {
          id: myOnboarding.id,
          type: myOnboarding.type,
          totalTasks: onboardingTasks.length,
          completedTasks: onboardingDone,
          progressPercent:
            onboardingTasks.length === 0
              ? 0
              : Math.round((onboardingDone / onboardingTasks.length) * 100),
        }
      : null,
  };
}

/** Birthdays and work anniversaries in the next N days — the people feed. */
export async function getUpcomingMilestones(days = 30) {
  await requireAnyPermission([...HR_VIEW, 'HR:ATTENDANCE_MANAGE']);

  const staff = await prisma.staff.findMany({
    where: { status: { in: ['ACTIVE', 'ON_LEAVE'] }, isDeleted: false },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      hireDate: true,
      profilePhoto: true,
      jobTitle: true,
      department: { select: { name: true } },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);

  /** Days until the next occurrence of a month/day, ignoring the year. */
  const daysUntilAnniversary = (date: Date): number => {
    const next = new Date(today.getFullYear(), date.getMonth(), date.getDate());
    if (next < today) next.setFullYear(next.getFullYear() + 1);
    return Math.round((next.getTime() - today.getTime()) / 86_400_000);
  };

  const birthdays = staff
    .filter((s) => s.dateOfBirth)
    .map((s) => ({
      staffId: s.id,
      employeeId: s.employeeId,
      name: `${s.firstName} ${s.lastName}`,
      department: s.department.name,
      jobTitle: s.jobTitle,
      profilePhoto: s.profilePhoto,
      date: s.dateOfBirth!,
      daysAway: daysUntilAnniversary(s.dateOfBirth!),
    }))
    .filter((b) => b.daysAway <= days)
    .sort((a, b) => a.daysAway - b.daysAway);

  const anniversaries = staff
    .map((s) => {
      const daysAway = daysUntilAnniversary(s.hireDate);
      const nextYear = new Date(today.getFullYear(), s.hireDate.getMonth(), s.hireDate.getDate());
      if (nextYear < today) nextYear.setFullYear(nextYear.getFullYear() + 1);
      const years = nextYear.getFullYear() - s.hireDate.getFullYear();
      return {
        staffId: s.id,
        employeeId: s.employeeId,
        name: `${s.firstName} ${s.lastName}`,
        department: s.department.name,
        jobTitle: s.jobTitle,
        profilePhoto: s.profilePhoto,
        date: s.hireDate,
        daysAway,
        years,
      };
    })
    .filter((a) => a.daysAway <= days && a.years > 0)
    .sort((a, b) => a.daysAway - b.daysAway);

  return { horizonDays: days, birthdays, anniversaries };
}
