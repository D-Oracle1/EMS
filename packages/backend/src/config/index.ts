/**
 * Hylink EMS - Configuration Module
 * Centralized configuration management
 */

import { z } from 'zod';

const configSchema = z.object({
  // Server
  port: z.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  databaseUrl: z.string(),

  // JWT
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('8h'),
  jwtRefreshSecret: z.string().min(32),
  jwtRefreshExpiresIn: z.string().default('7d'),

  // Password
  bcryptRounds: z.number().default(12),
  passwordMinLength: z.number().default(8),
  maxLoginAttempts: z.number().default(5),
  lockoutDurationMinutes: z.number().default(30),

  // Session
  sessionTimeoutMinutes: z.number().default(480),

  // File Upload
  maxFileSizeMb: z.number().default(10),
  uploadPath: z.string().default('./uploads'),
  allowedFileTypes: z.string().default('pdf,jpg,jpeg,png,doc,docx,xls,xlsx'),

  // Logging
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  logFilePath: z.string().default('./logs'),

  // Company
  companyName: z.string().default('Hylink Finance Limited'),
  companyCode: z.string().default('HFL'),
  baseCurrency: z.string().default('NGN'),
  financialYearStartMonth: z.number().min(1).max(12).default(1),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const rawConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || 'development-secret-key-32-characters',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-32-characters',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    lockoutDurationMinutes: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '30', 10),
    sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '480', 10),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    allowedFileTypes: process.env.ALLOWED_FILE_TYPES || 'pdf,jpg,jpeg,png,doc,docx,xls,xlsx',
    logLevel: process.env.LOG_LEVEL || 'info',
    logFilePath: process.env.LOG_FILE_PATH || './logs',
    companyName: process.env.COMPANY_NAME || 'Hylink Finance Limited',
    companyCode: process.env.COMPANY_CODE || 'HFL',
    baseCurrency: process.env.BASE_CURRENCY || 'NGN',
    financialYearStartMonth: parseInt(process.env.FINANCIAL_YEAR_START_MONTH || '1', 10),
  };

  return configSchema.parse(rawConfig);
}

export const config = loadConfig();

// Permission Matrix Configuration
export const PERMISSION_MATRIX = {
  // HR Module - Cannot post financial transactions
  HR: {
    STAFF_CREATE: ['HR_ADMIN', 'HR_MANAGER'],
    STAFF_READ: ['HR_ADMIN', 'HR_MANAGER', 'HR_OFFICER', 'MANAGER', 'DIRECTOR'],
    STAFF_UPDATE: ['HR_ADMIN', 'HR_MANAGER'],
    STAFF_DELETE: ['HR_ADMIN'],
    ATTENDANCE_MANAGE: ['HR_ADMIN', 'HR_MANAGER', 'HR_OFFICER'],
    PERFORMANCE_MANAGE: ['HR_ADMIN', 'HR_MANAGER'],
  },

  // Loans Module - Segregated duties
  LOANS: {
    LOAN_CREATE: ['LOAN_OFFICER'],
    LOAN_READ: ['LOAN_OFFICER', 'VERIFICATION_OFFICER', 'LOAN_MANAGER', 'DIRECTOR', 'ACCOUNTANT'],
    LOAN_UPDATE: ['LOAN_OFFICER'],
    LOAN_VERIFY: ['VERIFICATION_OFFICER'],
    LOAN_APPROVE_L1: ['LOAN_MANAGER'],
    LOAN_APPROVE_L2: ['DIRECTOR', 'MD'],
    LOAN_DISBURSE: ['ACCOUNTANT', 'FINANCE_MANAGER'],
    LOAN_COLLECT: ['LOAN_OFFICER', 'CASHIER'],
  },

  // Savings Module
  SAVINGS: {
    SAVINGS_CREATE: ['SAVINGS_OFFICER', 'CUSTOMER_SERVICE'],
    SAVINGS_READ: ['SAVINGS_OFFICER', 'CUSTOMER_SERVICE', 'ACCOUNTANT', 'MANAGER'],
    SAVINGS_DEPOSIT: ['SAVINGS_OFFICER', 'CASHIER'],
    SAVINGS_WITHDRAW: ['SAVINGS_OFFICER', 'CASHIER'],
    SAVINGS_APPROVE_LARGE: ['MANAGER', 'DIRECTOR'],
  },

  // Fixed Deposits
  FIXED_DEPOSITS: {
    FD_CREATE: ['FD_OFFICER', 'CUSTOMER_SERVICE'],
    FD_READ: ['FD_OFFICER', 'CUSTOMER_SERVICE', 'ACCOUNTANT', 'MANAGER'],
    FD_LIQUIDATE: ['FD_OFFICER', 'MANAGER'],
    FD_APPROVE: ['MANAGER', 'DIRECTOR'],
  },

  // Accounts & Finance - Critical
  ACCOUNTS: {
    COA_MANAGE: ['FINANCE_MANAGER', 'CFO'],
    JOURNAL_CREATE: ['ACCOUNTANT', 'FINANCE_MANAGER'],
    JOURNAL_APPROVE: ['FINANCE_MANAGER', 'CFO'],
    JOURNAL_POST: ['FINANCE_MANAGER'],
    JOURNAL_REVERSE: ['CFO'],
    REPORTS_VIEW: ['ACCOUNTANT', 'FINANCE_MANAGER', 'CFO', 'DIRECTOR', 'AUDITOR'],
    REPORTS_EXPORT: ['ACCOUNTANT', 'FINANCE_MANAGER', 'CFO', 'AUDITOR'],
    PERIOD_CLOSE: ['CFO'],
  },

  // Documents
  DOCUMENTS: {
    DOCUMENT_UPLOAD: ['*'], // All authenticated users
    DOCUMENT_READ: ['*'],
    DOCUMENT_APPROVE: ['MANAGER', 'DIRECTOR'],
    DOCUMENT_DELETE: ['ADMIN', 'DIRECTOR'],
  },

  // Audit
  AUDIT: {
    AUDIT_READ: ['AUDITOR', 'CFO', 'MD', 'DIRECTOR'],
    AUDIT_EXPORT: ['AUDITOR', 'CFO'],
  },

  // System Administration
  SYSTEM: {
    USER_MANAGE: ['ADMIN', 'IT_ADMIN'],
    ROLE_MANAGE: ['ADMIN'],
    CONFIG_MANAGE: ['ADMIN', 'IT_ADMIN'],
    BACKUP_MANAGE: ['IT_ADMIN'],
  },
} as const;

// Role Hierarchy Levels
export const ROLE_LEVELS = {
  MD: 100,
  DIRECTOR: 90,
  CFO: 85,
  FINANCE_MANAGER: 80,
  LOAN_MANAGER: 75,
  HR_MANAGER: 75,
  MANAGER: 70,
  AUDITOR: 65,
  ACCOUNTANT: 60,
  LOAN_OFFICER: 50,
  VERIFICATION_OFFICER: 50,
  SAVINGS_OFFICER: 50,
  FD_OFFICER: 50,
  HR_OFFICER: 50,
  CASHIER: 45,
  CUSTOMER_SERVICE: 40,
  ADMIN: 95,
  IT_ADMIN: 85,
} as const;

// Approval Limits by Role (in base currency)
export const APPROVAL_LIMITS = {
  LOAN_OFFICER: 0, // Cannot approve
  VERIFICATION_OFFICER: 0, // Cannot approve
  LOAN_MANAGER: 5000000, // 5 million
  DIRECTOR: 25000000, // 25 million
  MD: 100000000, // 100 million
  CFO: 50000000, // 50 million
} as const;
