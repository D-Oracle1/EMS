/**
 * Hylink EMS - Core Type Definitions
 */

import { Request } from 'express';
import { Staff, Role, Permission } from '@prisma/client';

// Authenticated User Context
export interface AuthenticatedUser {
  id: string;
  employeeId: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleCode: string;
  roleLevel: number;
  approvalLimit: number | null;
  departmentId: string;
  branchId: string | null;
  permissions: string[];
}

// Extended Request with Auth
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  sessionId?: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ValidationError[];
  meta?: ResponseMeta;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Audit Trail Types
export interface AuditContext {
  userId: string;
  userEmail: string;
  userRole: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface AuditEntry {
  action: string;
  module: string;
  entityType: string;
  entityId?: string;
  description: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  context: AuditContext;
}

// Approval Workflow Types
export interface ApprovalRequest {
  entityType: string;
  entityId: string;
  requiredLevel: number;
  currentApprovals: ApprovalRecord[];
}

export interface ApprovalRecord {
  level: number;
  approverId: string;
  decision: 'APPROVED' | 'REJECTED' | 'REFERRED_UP' | 'RETURNED_FOR_REVIEW';
  comments?: string;
  timestamp: Date;
}

// Financial Types
export interface JournalEntryInput {
  entryDate: Date;
  description: string;
  sourceModule?: string;
  sourceType?: string;
  sourceId?: string;
  lines: JournalLineInput[];
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

// Loan Calculation Types
export interface LoanCalculation {
  principalAmount: number;
  interestRate: number;
  tenure: number;
  interestType: 'FLAT' | 'REDUCING_BALANCE' | 'COMPOUND';
  totalInterest: number;
  totalRepayment: number;
  monthlyInstalment: number;
  schedule: ScheduleEntry[];
}

export interface ScheduleEntry {
  installmentNumber: number;
  dueDate: Date;
  principalDue: number;
  interestDue: number;
  totalDue: number;
  outstandingBalance: number;
}

// Report Types
export interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  branchId?: string;
  departmentId?: string;
  productId?: string;
  staffId?: string;
  customerId?: string;
  status?: string;
}

export interface TrialBalanceEntry {
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalance: number;
  creditBalance: number;
}

export interface GeneralLedgerEntry {
  date: Date;
  entryNumber: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
}

// Service Response Types
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

// Notification Types
export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
}

// Document Types
export interface DocumentUpload {
  file: Express.Multer.File;
  categoryId: string;
  title: string;
  description?: string;
  customerId?: string;
  loanId?: string;
  documentDate?: Date;
  expiryDate?: Date;
  isConfidential?: boolean;
}

// Staff with Relations
export interface StaffWithRelations extends Staff {
  role: Role & { permissions: { permission: Permission }[] };
  department: { id: string; code: string; name: string };
  branch?: { id: string; code: string; name: string } | null;
}

// Enums as const objects for runtime use
export const MODULES = {
  HR: 'HR',
  LOANS: 'LOANS',
  SAVINGS: 'SAVINGS',
  FIXED_DEPOSITS: 'FIXED_DEPOSITS',
  ACCOUNTS: 'ACCOUNTS',
  DOCUMENTS: 'DOCUMENTS',
  AUDIT: 'AUDIT',
  SYSTEM: 'SYSTEM',
  CUSTOMERS: 'CUSTOMERS',
  VERIFICATION: 'VERIFICATION',
} as const;

export const ACTIONS = {
  CREATE: 'CREATE',
  READ: 'READ',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  EXPORT: 'EXPORT',
  PRINT: 'PRINT',
  VERIFY: 'VERIFY',
  DISBURSE: 'DISBURSE',
  COLLECT: 'COLLECT',
  REVERSE: 'REVERSE',
  POST: 'POST',
  CLOSE: 'CLOSE',
} as const;
