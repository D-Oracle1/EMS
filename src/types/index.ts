export interface SessionUser {
  id: string;
  email: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  role: string;
  roleCode: string;
  roleLevel: number;
  approvalLimit: number;
  department: string;
  departmentCode: string;
  branchId: string | null;
  branchName: string | null;
  permissions: string[];
  mustChangePassword: boolean;
}

export interface JournalLineInput {
  accountId: string;
  debitAmount?: number;
  creditAmount?: number;
  description?: string;
  customerId?: string;
  referenceType?: string;
  referenceId?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ActionResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface DashboardLoanSummary {
  id: string;
  loanNumber: string;
  status: string;
  principalAmount: number;
  customer: { firstName: string; lastName: string; customerNumber: string } | null;
  createdAt?: string;
}

export interface DashboardLoanStatusBoardItem extends DashboardLoanSummary {
  product: { name: string } | null;
  verificationOfficer: { firstName: string; lastName: string } | null;
  approval: { decision: string; comments: string | null; approver: { firstName: string; lastName: string }; date: string } | null;
  updatedAt?: string;
}

export interface DashboardPendingApprovalLoan extends DashboardLoanSummary {
  createdBy: { firstName: string; lastName: string } | null;
}

export interface DashboardVerificationTask {
  id: string;
  status: string;
  priority: number;
  taskType: string;
  customer: { firstName: string; lastName: string; customerNumber: string } | null;
  loan: { loanNumber: string } | null;
  assignedToId: string;
  createdAt: string;
}

export interface DashboardJournalItem {
  id: string;
  entryNumber: string;
  description: string;
  totalDebit: number;
  status: string;
  createdAt: string;
}

export interface DashboardData {
  unreadNotifications: number;
  roleCode: string;
  attendance: { status: string | null; clockIn: string | null; clockOut: string | null; isClockedIn: boolean };
  loans?: { draft: number; pendingVerification: number; pendingApproval: number; active: number; overdue: number; total: number };
  savings?: { activeAccounts: number; totalBalance: number; todayDeposits: number; todayDepositsAmount: number; todayWithdrawals: number; todayWithdrawalsAmount: number; pendingWithdrawals: number };
  fixedDeposits?: { activeCount: number; totalPrincipal: number };
  customers?: { activeCount: number };
  hr?: { activeStaff: number; presentToday: number; absentToday: number; pendingLeave: number };
  verification?: { myTasks: number; allPending: number };
  accounting?: { pendingJournals: number };
  audit?: { todayLogs: number };
  executive?: { totalLoansOutstanding: number; totalSavingsDeposits: number; totalFixedDeposits: number };
  myRecentLoans?: DashboardLoanSummary[];
  myLoansStatusBoard?: DashboardLoanStatusBoardItem[];
  pendingApprovalLoans?: DashboardPendingApprovalLoan[];
  myActiveVerificationTasks?: DashboardVerificationTask[];
  recentJournals?: DashboardJournalItem[];
  disbursementChart?: { month: string; amount: number }[];
  loansByCategory?: { name: string; count: number; amount: number }[];
  loansByOfficer?: { name: string; count: number; amount: number }[];
  riskIndicators?: {
    par: number;            // Portfolio at Risk % (outstanding balance of overdue loans / total)
    nplRate: number;        // NPL count rate % (overdue+defaulted count / total active count)
    collectionRate: number; // Monthly collection rate % (amount collected / amount due this month)
    overdueCount: number;
    totalActiveCount: number;
  };
}
