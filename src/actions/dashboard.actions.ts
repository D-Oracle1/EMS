'use server';

import { prisma } from '@/lib/prisma';
import { getSession, hasPermission, hasAnyPermission, hasModuleAccess } from '@/lib/auth-utils';
import type { DashboardData } from '@/types';

export async function getDashboardData(): Promise<DashboardData> {
  const { user } = await getSession();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result: Record<string, unknown> = {};

  // Determine if user is a manager/approver (sees all loans) or a loan officer (sees only their own)
  const isApprover = hasAnyPermission(user, ['LOANS:APPROVE_L1', 'LOANS:APPROVE_L2']);
  const isLoanOfficer = hasPermission(user, 'LOANS:CREATE') && !isApprover;

  // Build all queries in parallel for speed
  const queries: Array<{ key: string; promise: Promise<unknown> }> = [];

  // Everyone gets their notifications
  queries.push({
    key: 'unreadNotifications',
    promise: prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  });
  // Attendance for non-admin roles (system admin doesn't clock in)
  if (user.roleCode !== 'SUPER_ADMIN') {
    queries.push({
      key: 'attendance',
      promise: prisma.attendance.findFirst({ where: { staffId: user.id, date: today } }),
    });
  }

  if (hasModuleAccess(user, 'LOANS')) {
    // For loan officers, scope loan stats to their own loans
    // For managers/admins, show all loans
    const loanWhere = isLoanOfficer
      ? { createdById: user.id, isDeleted: false }
      : { isDeleted: false };

    queries.push({
      key: 'loanCounts',
      promise: prisma.loan.groupBy({ by: ['status'], where: loanWhere, _count: true }),
    });
  }

  if (hasModuleAccess(user, 'SAVINGS')) {
    queries.push({
      key: 'savingsStats',
      promise: prisma.savingsAccount.aggregate({ where: { status: 'ACTIVE' }, _count: true, _sum: { currentBalance: true } }),
    });
    queries.push({
      key: 'todayDeposits',
      promise: prisma.savingsTransaction.aggregate({
        where: { transactionType: 'DEPOSIT', createdAt: { gte: today } },
        _count: true,
        _sum: { amount: true },
      }),
    });
    queries.push({
      key: 'todayWithdrawals',
      promise: prisma.savingsTransaction.aggregate({
        where: { transactionType: 'WITHDRAWAL', createdAt: { gte: today } },
        _count: true,
        _sum: { amount: true },
      }),
    });
    queries.push({
      key: 'pendingWithdrawalRequests',
      promise: prisma.withdrawalRequest.count({ where: { status: 'PENDING' } }),
    });
  }

  if (hasModuleAccess(user, 'FIXED_DEPOSITS')) {
    queries.push({
      key: 'fdStats',
      promise: prisma.fixedDeposit.aggregate({ where: { status: 'ACTIVE' }, _count: true, _sum: { principalAmount: true } }),
    });
  }

  if (hasModuleAccess(user, 'CUSTOMERS')) {
    queries.push({
      key: 'customerCount',
      promise: prisma.customer.count({ where: { status: 'ACTIVE' } }),
    });
  }

  if (hasModuleAccess(user, 'HR')) {
    queries.push(
      { key: 'activeStaff', promise: prisma.staff.count({ where: { status: 'ACTIVE' } }) },
      { key: 'presentToday', promise: prisma.attendance.count({ where: { date: today, status: 'PRESENT' } }) },
      { key: 'absentToday', promise: prisma.attendance.count({ where: { date: today, status: 'ABSENT' } }) },
      { key: 'pendingLeave', promise: prisma.leaveRequest.count({ where: { status: 'PENDING' } }) },
    );
  }

  if (hasPermission(user, 'LOANS:VERIFY')) {
    queries.push(
      { key: 'myVerificationTasks', promise: prisma.verificationTask.count({ where: { assignedToId: user.id, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } }) },
      { key: 'allPendingVerification', promise: prisma.verificationTask.count({ where: { status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } } }) },
    );

    // Active verification task list for verification officers (only assigned to them)
    queries.push({
      key: 'myActiveVerificationTasks',
      promise: prisma.verificationTask.findMany({
        where: {
          assignedToId: user.id,
          status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        },
        include: {
          customer: { select: { firstName: true, lastName: true, customerNumber: true } },
          loan: { select: { loanNumber: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 10,
      }),
    });
  }

  if (hasModuleAccess(user, 'ACCOUNTS')) {
    queries.push({
      key: 'pendingJournals',
      promise: prisma.journalEntry.count({ where: { status: { in: ['DRAFT', 'PENDING_APPROVAL'] } } }),
    });
  }

  if (hasPermission(user, 'AUDIT:READ')) {
    queries.push({
      key: 'todayLogs',
      promise: prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
    });
  }

  if (hasPermission(user, 'ACCOUNTS:REPORTS_VIEW')) {
    queries.push(
      { key: 'execLoans', promise: prisma.loan.aggregate({ where: { status: { in: ['ACTIVE', 'OVERDUE'] } }, _sum: { principalAmount: true } }) },
      { key: 'execSavings', promise: prisma.savingsAccount.aggregate({ where: { status: 'ACTIVE' }, _sum: { currentBalance: true } }) },
      { key: 'execFDs', promise: prisma.fixedDeposit.aggregate({ where: { status: 'ACTIVE' }, _sum: { principalAmount: true } }) },
    );

    // Risk indicators
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    queries.push(
      { key: 'riskOverdue', promise: prisma.loan.aggregate({ where: { status: 'OVERDUE', isDeleted: false }, _sum: { principalAmount: true }, _count: { _all: true } }) },
      { key: 'riskActive', promise: prisma.loan.aggregate({ where: { status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED'] }, isDeleted: false }, _sum: { principalAmount: true }, _count: { _all: true } }) },
      { key: 'riskCollection', promise: prisma.loanSchedule.aggregate({ where: { dueDate: { gte: monthStart, lte: new Date() } }, _sum: { totalDue: true, totalPaid: true } }) },
    );
  }

  // --- Role-specific "My Work" queries ---

  // Loan Officer: My recent loans
  if (isLoanOfficer) {
    queries.push({
      key: 'myRecentLoans',
      promise: prisma.loan.findMany({
        where: { createdById: user.id, isDeleted: false },
        include: {
          customer: { select: { firstName: true, lastName: true, customerNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    });
  }

  // Loan Officer: All loans with status updates (approved/rejected/active spreadsheet)
  if (isLoanOfficer) {
    queries.push({
      key: 'myLoansStatusBoard',
      promise: prisma.loan.findMany({
        where: {
          createdById: user.id,
          isDeleted: false,
          status: { in: ['PENDING_VERIFICATION', 'VERIFICATION_IN_PROGRESS', 'VERIFIED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVE', 'DISBURSED', 'OVERDUE', 'CLOSED'] },
        },
        include: {
          customer: { select: { firstName: true, lastName: true, customerNumber: true } },
          product: { select: { name: true } },
          verificationOfficer: { select: { firstName: true, lastName: true } },
          approvals: {
            select: { decision: true, comments: true, createdAt: true, approver: { select: { firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    });
  }

  // Manager/Approver: Loans pending approval
  if (isApprover) {
    queries.push({
      key: 'pendingApprovalLoans',
      promise: prisma.loan.findMany({
        where: { status: 'PENDING_APPROVAL', isDeleted: false },
        include: {
          customer: { select: { firstName: true, lastName: true, customerNumber: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
    });
  }

  // Accountant: Recent draft/pending journals
  if (hasPermission(user, 'ACCOUNTS:JOURNAL_CREATE')) {
    queries.push({
      key: 'recentJournals',
      promise: prisma.journalEntry.findMany({
        where: { status: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, entryNumber: true, description: true,
          totalDebit: true, status: true, createdAt: true,
        },
      }),
    });
  }

  // Chart data: Monthly loan disbursements (last 12 months) - only for managers/admins
  if (hasModuleAccess(user, 'LOANS') && !isLoanOfficer) {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    queries.push({
      key: 'disbursedLoans',
      promise: prisma.loan.findMany({
        where: {
          disbursedAt: { gte: twelveMonthsAgo },
          status: { in: ['ACTIVE', 'OVERDUE', 'DEFAULTED', 'CLOSED', 'WRITTEN_OFF'] },
          isDeleted: false,
        },
        select: { disbursedAt: true, principalAmount: true },
      }),
    });

    // Loan portfolio by product category
    queries.push({
      key: 'loansByProduct',
      promise: prisma.loan.groupBy({
        by: ['productId'],
        where: { isDeleted: false, status: { notIn: ['DRAFT', 'REJECTED'] } },
        _count: true,
        _sum: { principalAmount: true },
      }),
    });

    queries.push({
      key: 'loanProducts',
      promise: prisma.loanProduct.findMany({ select: { id: true, name: true } }),
    });

    // Loan officer performance
    queries.push({
      key: 'loansByOfficer',
      promise: prisma.loan.groupBy({
        by: ['createdById'],
        where: { isDeleted: false, status: { notIn: ['DRAFT', 'REJECTED'] } },
        _count: true,
        _sum: { principalAmount: true },
      }),
    });

    // loanOfficerNames will be resolved after loansByOfficer results are available
    queries.push({
      key: 'loanOfficerNames',
      promise: Promise.resolve(null), // placeholder - resolved below
    });
  }

  // Execute ALL queries in parallel
  const results = await Promise.all(queries.map((q) => q.promise));
  const data: Record<string, unknown> = {};
  queries.forEach((q, i) => { data[q.key] = results[i]; });

  // Map results
  result.unreadNotifications = data.unreadNotifications;
  result.roleCode = user.roleCode;

  const attendance = data.attendance as any;
  result.attendance = attendance
    ? { status: attendance.status, clockIn: attendance.clockIn, clockOut: attendance.clockOut, isClockedIn: !!attendance.clockIn && !attendance.clockOut }
    : { status: null, clockIn: null, clockOut: null, isClockedIn: false };

  if (data.loanCounts) {
    const loanMap: Record<string, number> = {};
    (data.loanCounts as any[]).forEach((l) => (loanMap[l.status] = l._count));
    result.loans = {
      draft: loanMap['DRAFT'] || 0, pendingVerification: loanMap['PENDING_VERIFICATION'] || 0,
      pendingApproval: loanMap['PENDING_APPROVAL'] || 0, active: loanMap['ACTIVE'] || 0,
      overdue: loanMap['OVERDUE'] || 0, total: Object.values(loanMap).reduce((a, b) => a + b, 0),
    };
  }

  if (data.savingsStats) {
    const s = data.savingsStats as any;
    const dep = data.todayDeposits as any;
    const wdr = data.todayWithdrawals as any;
    result.savings = {
      activeAccounts: s._count,
      totalBalance: s._sum.currentBalance?.toNumber() || 0,
      todayDeposits: dep?._count || 0,
      todayDepositsAmount: dep?._sum?.amount?.toNumber() || 0,
      todayWithdrawals: wdr?._count || 0,
      todayWithdrawalsAmount: wdr?._sum?.amount?.toNumber() || 0,
      pendingWithdrawals: (data.pendingWithdrawalRequests as number) || 0,
    };
  }

  if (data.fdStats) {
    const f = data.fdStats as any;
    result.fixedDeposits = { activeCount: f._count, totalPrincipal: f._sum.principalAmount?.toNumber() || 0 };
  }

  if (data.customerCount !== undefined) {
    result.customers = { activeCount: data.customerCount };
  }

  if (data.activeStaff !== undefined) {
    result.hr = { activeStaff: data.activeStaff, presentToday: data.presentToday, absentToday: data.absentToday, pendingLeave: data.pendingLeave };
  }

  if (data.myVerificationTasks !== undefined) {
    result.verification = { myTasks: data.myVerificationTasks, allPending: data.allPendingVerification };
  }

  if (data.pendingJournals !== undefined) {
    result.accounting = { pendingJournals: data.pendingJournals };
  }

  if (data.todayLogs !== undefined) {
    result.audit = { todayLogs: data.todayLogs };
  }

  if (data.execLoans) {
    result.executive = {
      totalLoansOutstanding: (data.execLoans as any)._sum.principalAmount?.toNumber() || 0,
      totalSavingsDeposits: (data.execSavings as any)._sum.currentBalance?.toNumber() || 0,
      totalFixedDeposits: (data.execFDs as any)._sum.principalAmount?.toNumber() || 0,
    };
  }

  if (data.riskActive) {
    const totalOutstanding = (data.riskActive as any)._sum.principalAmount?.toNumber() || 0;
    const overdueOutstanding = (data.riskOverdue as any)._sum.principalAmount?.toNumber() || 0;
    const totalCount = (data.riskActive as any)._count._all || 0;
    const overdueCount = (data.riskOverdue as any)._count._all || 0;
    const monthlyDue = (data.riskCollection as any)?._sum.totalDue?.toNumber() || 0;
    const monthlyPaid = (data.riskCollection as any)?._sum.totalPaid?.toNumber() || 0;
    result.riskIndicators = {
      par: totalOutstanding > 0 ? (overdueOutstanding / totalOutstanding) * 100 : 0,
      nplRate: totalCount > 0 ? (overdueCount / totalCount) * 100 : 0,
      collectionRate: monthlyDue > 0 ? Math.min(100, (monthlyPaid / monthlyDue) * 100) : 100,
      overdueCount,
      totalActiveCount: totalCount,
    };
  }

  // --- Role-specific "My Work" data ---

  // My recent loans (for loan officers)
  if (data.myRecentLoans) {
    result.myRecentLoans = (data.myRecentLoans as any[]).map((l) => ({
      id: l.id,
      loanNumber: l.loanNumber,
      status: l.status,
      principalAmount: l.principalAmount.toNumber(),
      customer: l.customer,
      createdAt: l.createdAt,
    }));
  }

  // My loans status board (for loan officers)
  if (data.myLoansStatusBoard) {
    result.myLoansStatusBoard = (data.myLoansStatusBoard as any[]).map((l) => ({
      id: l.id,
      loanNumber: l.loanNumber,
      status: l.status,
      principalAmount: l.principalAmount.toNumber(),
      customer: l.customer,
      product: l.product,
      verificationOfficer: l.verificationOfficer,
      approval: l.approvals[0] ? {
        decision: l.approvals[0].decision,
        comments: l.approvals[0].comments,
        approver: l.approvals[0].approver,
        date: l.approvals[0].createdAt,
      } : null,
      updatedAt: l.updatedAt,
    }));
  }

  // Pending approval loans (for managers)
  if (data.pendingApprovalLoans) {
    result.pendingApprovalLoans = (data.pendingApprovalLoans as any[]).map((l) => ({
      id: l.id,
      loanNumber: l.loanNumber,
      status: l.status,
      principalAmount: l.principalAmount.toNumber(),
      customer: l.customer,
      createdBy: l.createdBy,
      createdAt: l.createdAt,
    }));
  }

  // Active verification tasks (for verification officers)
  if (data.myActiveVerificationTasks) {
    result.myActiveVerificationTasks = (data.myActiveVerificationTasks as any[]).map((t) => ({
      id: t.id,
      status: t.status,
      priority: t.priority,
      taskType: t.taskType,
      customer: t.customer,
      loan: t.loan,
      assignedToId: t.assignedToId,
      createdAt: t.createdAt,
    }));
  }

  // Recent journals (for accountants)
  if (data.recentJournals) {
    result.recentJournals = (data.recentJournals as any[]).map((j) => ({
      id: j.id,
      entryNumber: j.entryNumber,
      description: j.description,
      totalDebit: j.totalDebit.toNumber(),
      status: j.status,
      createdAt: j.createdAt,
    }));
  }

  // Map monthly disbursement chart data
  if (data.disbursedLoans) {
    const monthlyMap: Record<string, number> = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[key] = 0;
    }
    (data.disbursedLoans as any[]).forEach((loan) => {
      if (loan.disbursedAt) {
        const d = new Date(loan.disbursedAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key in monthlyMap) {
          monthlyMap[key] += loan.principalAmount?.toNumber?.() ?? Number(loan.principalAmount) ?? 0;
        }
      }
    });
    result.disbursementChart = Object.entries(monthlyMap).map(([month, amount]) => ({
      month,
      amount,
    }));
  }

  // Map loan portfolio by product
  if (data.loansByProduct && data.loanProducts) {
    const productMap: Record<string, string> = {};
    (data.loanProducts as any[]).forEach((p) => { productMap[p.id] = p.name; });
    result.loansByCategory = (data.loansByProduct as any[]).map((g) => ({
      name: productMap[g.productId] || 'Unknown',
      count: g._count,
      amount: g._sum.principalAmount?.toNumber?.() ?? Number(g._sum.principalAmount) ?? 0,
    }));
  }

  // Map loan officer performance
  if (data.loansByOfficer) {
    const officerIds = (data.loansByOfficer as any[]).map((g) => g.createdById);
    const officers = officerIds.length > 0
      ? await prisma.staff.findMany({ where: { id: { in: officerIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const staffMap: Record<string, string> = {};
    officers.forEach((s) => { staffMap[s.id] = `${s.firstName} ${s.lastName}`; });
    result.loansByOfficer = (data.loansByOfficer as any[]).map((g) => ({
      name: staffMap[g.createdById] || 'Unknown',
      count: g._count,
      amount: g._sum.principalAmount?.toNumber?.() ?? Number(g._sum.principalAmount) ?? 0,
    }));
  }

  return result as unknown as DashboardData;
}
