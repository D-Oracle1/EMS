/**
 * Hylink EMS - Database Seed Script
 * Initial data setup for the system
 */

import { PrismaClient, AccountType, BalanceType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // ============================================================================
  // PERMISSIONS
  // ============================================================================
  console.log('Creating permissions...');

  const permissionData = [
    // HR Module
    { code: 'HR:STAFF_CREATE', module: 'HR', action: 'STAFF_CREATE', description: 'Create staff members' },
    { code: 'HR:STAFF_READ', module: 'HR', action: 'STAFF_READ', description: 'View staff members' },
    { code: 'HR:STAFF_UPDATE', module: 'HR', action: 'STAFF_UPDATE', description: 'Update staff members' },
    { code: 'HR:STAFF_DELETE', module: 'HR', action: 'STAFF_DELETE', description: 'Delete staff members' },
    { code: 'HR:ATTENDANCE_MANAGE', module: 'HR', action: 'ATTENDANCE_MANAGE', description: 'Manage attendance' },
    { code: 'HR:PERFORMANCE_MANAGE', module: 'HR', action: 'PERFORMANCE_MANAGE', description: 'Manage performance reviews' },

    // Customer Module
    { code: 'CUSTOMERS:CREATE', module: 'CUSTOMERS', action: 'CREATE', description: 'Create customers' },
    { code: 'CUSTOMERS:READ', module: 'CUSTOMERS', action: 'READ', description: 'View customers' },
    { code: 'CUSTOMERS:UPDATE', module: 'CUSTOMERS', action: 'UPDATE', description: 'Update customers' },

    // Loans Module
    { code: 'LOANS:CREATE', module: 'LOANS', action: 'CREATE', description: 'Create loan applications' },
    { code: 'LOANS:READ', module: 'LOANS', action: 'READ', description: 'View loans' },
    { code: 'LOANS:UPDATE', module: 'LOANS', action: 'UPDATE', description: 'Update loans' },
    { code: 'LOANS:VERIFY', module: 'LOANS', action: 'VERIFY', description: 'Verify loan applications' },
    { code: 'LOANS:APPROVE_L1', module: 'LOANS', action: 'APPROVE_L1', description: 'Approve loans (Level 1)' },
    { code: 'LOANS:APPROVE_L2', module: 'LOANS', action: 'APPROVE_L2', description: 'Approve loans (Level 2)' },
    { code: 'LOANS:DISBURSE', module: 'LOANS', action: 'DISBURSE', description: 'Disburse loans' },
    { code: 'LOANS:COLLECT', module: 'LOANS', action: 'COLLECT', description: 'Collect repayments' },

    // Savings Module
    { code: 'SAVINGS:CREATE', module: 'SAVINGS', action: 'CREATE', description: 'Create savings accounts' },
    { code: 'SAVINGS:READ', module: 'SAVINGS', action: 'READ', description: 'View savings accounts' },
    { code: 'SAVINGS:DEPOSIT', module: 'SAVINGS', action: 'DEPOSIT', description: 'Process deposits' },
    { code: 'SAVINGS:WITHDRAW', module: 'SAVINGS', action: 'WITHDRAW', description: 'Process withdrawals' },

    // Fixed Deposits Module
    { code: 'FIXED_DEPOSITS:CREATE', module: 'FIXED_DEPOSITS', action: 'CREATE', description: 'Create fixed deposits' },
    { code: 'FIXED_DEPOSITS:READ', module: 'FIXED_DEPOSITS', action: 'READ', description: 'View fixed deposits' },
    { code: 'FIXED_DEPOSITS:LIQUIDATE', module: 'FIXED_DEPOSITS', action: 'LIQUIDATE', description: 'Liquidate fixed deposits' },

    // Accounts Module
    { code: 'ACCOUNTS:COA_MANAGE', module: 'ACCOUNTS', action: 'COA_MANAGE', description: 'Manage chart of accounts' },
    { code: 'ACCOUNTS:JOURNAL_CREATE', module: 'ACCOUNTS', action: 'JOURNAL_CREATE', description: 'Create journal entries' },
    { code: 'ACCOUNTS:JOURNAL_APPROVE', module: 'ACCOUNTS', action: 'JOURNAL_APPROVE', description: 'Approve journal entries' },
    { code: 'ACCOUNTS:JOURNAL_POST', module: 'ACCOUNTS', action: 'JOURNAL_POST', description: 'Post journal entries' },
    { code: 'ACCOUNTS:JOURNAL_REVERSE', module: 'ACCOUNTS', action: 'JOURNAL_REVERSE', description: 'Reverse journal entries' },
    { code: 'ACCOUNTS:REPORTS_VIEW', module: 'ACCOUNTS', action: 'REPORTS_VIEW', description: 'View financial reports' },
    { code: 'ACCOUNTS:REPORTS_EXPORT', module: 'ACCOUNTS', action: 'REPORTS_EXPORT', description: 'Export financial reports' },
    { code: 'ACCOUNTS:PERIOD_CLOSE', module: 'ACCOUNTS', action: 'PERIOD_CLOSE', description: 'Close financial periods' },

    // Documents Module
    { code: 'DOCUMENTS:UPLOAD', module: 'DOCUMENTS', action: 'UPLOAD', description: 'Upload documents' },
    { code: 'DOCUMENTS:READ', module: 'DOCUMENTS', action: 'READ', description: 'View documents' },
    { code: 'DOCUMENTS:UPDATE', module: 'DOCUMENTS', action: 'UPDATE', description: 'Update documents' },
    { code: 'DOCUMENTS:APPROVE', module: 'DOCUMENTS', action: 'APPROVE', description: 'Approve documents' },
    { code: 'DOCUMENTS:DELETE', module: 'DOCUMENTS', action: 'DELETE', description: 'Delete documents' },

    // Audit Module
    { code: 'AUDIT:READ', module: 'AUDIT', action: 'READ', description: 'View audit logs' },
    { code: 'AUDIT:EXPORT', module: 'AUDIT', action: 'EXPORT', description: 'Export audit logs' },

    // System Module
    { code: 'SYSTEM:USER_MANAGE', module: 'SYSTEM', action: 'USER_MANAGE', description: 'Manage system users' },
    { code: 'SYSTEM:ROLE_MANAGE', module: 'SYSTEM', action: 'ROLE_MANAGE', description: 'Manage roles' },
    { code: 'SYSTEM:CONFIG_MANAGE', module: 'SYSTEM', action: 'CONFIG_MANAGE', description: 'Manage system configuration' },
  ];

  for (const perm of permissionData) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }

  // ============================================================================
  // DEPARTMENTS
  // ============================================================================
  console.log('Creating departments...');

  const departments = [
    { code: 'EXEC', name: 'Executive Management', description: 'Executive leadership team' },
    { code: 'HR', name: 'Human Resources', description: 'HR and administration' },
    { code: 'FIN', name: 'Finance & Accounts', description: 'Finance and accounting' },
    { code: 'LOANS', name: 'Loans', description: 'Loan operations' },
    { code: 'SAVINGS', name: 'Savings', description: 'Savings operations' },
    { code: 'OPS', name: 'Operations', description: 'General operations' },
    { code: 'IT', name: 'Information Technology', description: 'IT and systems' },
    { code: 'AUDIT', name: 'Internal Audit', description: 'Internal audit' },
    { code: 'VERIFY', name: 'Verification', description: 'Field verification' },
  ];

  const deptMap: Record<string, string> = {};
  for (const dept of departments) {
    const d = await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: dept,
    });
    deptMap[dept.code] = d.id;
  }

  // ============================================================================
  // ROLES
  // ============================================================================
  console.log('Creating roles...');

  const roles = [
    { code: 'MD', name: 'Managing Director', level: 100, approvalLimit: 100000000 },
    { code: 'DIRECTOR', name: 'Director', level: 90, approvalLimit: 50000000 },
    { code: 'CFO', name: 'Chief Finance Officer', level: 85, approvalLimit: 50000000 },
    { code: 'FINANCE_MANAGER', name: 'Finance Manager', level: 80, approvalLimit: 25000000 },
    { code: 'LOAN_MANAGER', name: 'Loan Manager', level: 75, approvalLimit: 10000000 },
    { code: 'HR_MANAGER', name: 'HR Manager', level: 75, approvalLimit: 0 },
    { code: 'AUDITOR', name: 'Internal Auditor', level: 65, approvalLimit: 0 },
    { code: 'ACCOUNTANT', name: 'Accountant', level: 60, approvalLimit: 0 },
    { code: 'LOAN_OFFICER', name: 'Loan Officer', level: 50, approvalLimit: 0 },
    { code: 'VERIFICATION_OFFICER', name: 'Verification Officer', level: 50, approvalLimit: 0 },
    { code: 'SAVINGS_OFFICER', name: 'Savings Officer', level: 50, approvalLimit: 0 },
    { code: 'FD_OFFICER', name: 'Fixed Deposit Officer', level: 50, approvalLimit: 0 },
    { code: 'CASHIER', name: 'Cashier', level: 45, approvalLimit: 0 },
    { code: 'CUSTOMER_SERVICE', name: 'Customer Service', level: 40, approvalLimit: 0 },
    { code: 'ADMIN', name: 'System Administrator', level: 95, approvalLimit: 0 },
  ];

  const roleMap: Record<string, string> = {};
  for (const role of roles) {
    const r = await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: role,
    });
    roleMap[role.code] = r.id;
  }

  // Assign permissions to roles
  const rolePermissions: Record<string, string[]> = {
    MD: permissionData.map(p => p.code),
    DIRECTOR: permissionData.map(p => p.code),
    CFO: permissionData.filter(p => ['ACCOUNTS', 'AUDIT'].includes(p.module)).map(p => p.code),
    FINANCE_MANAGER: permissionData.filter(p => p.module === 'ACCOUNTS').map(p => p.code),
    LOAN_MANAGER: ['LOANS:READ', 'LOANS:APPROVE_L1', 'CUSTOMERS:READ', 'ACCOUNTS:REPORTS_VIEW'],
    HR_MANAGER: permissionData.filter(p => p.module === 'HR').map(p => p.code),
    AUDITOR: ['AUDIT:READ', 'AUDIT:EXPORT', 'ACCOUNTS:REPORTS_VIEW', 'ACCOUNTS:REPORTS_EXPORT'],
    ACCOUNTANT: ['ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:REPORTS_VIEW', 'LOANS:READ', 'SAVINGS:READ', 'FIXED_DEPOSITS:READ', 'LOANS:DISBURSE'],
    LOAN_OFFICER: ['LOANS:CREATE', 'LOANS:READ', 'LOANS:UPDATE', 'LOANS:COLLECT', 'CUSTOMERS:CREATE', 'CUSTOMERS:READ', 'CUSTOMERS:UPDATE', 'DOCUMENTS:UPLOAD', 'DOCUMENTS:READ'],
    VERIFICATION_OFFICER: ['LOANS:READ', 'LOANS:VERIFY', 'CUSTOMERS:READ', 'DOCUMENTS:UPLOAD', 'DOCUMENTS:READ'],
    SAVINGS_OFFICER: ['SAVINGS:CREATE', 'SAVINGS:READ', 'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW', 'CUSTOMERS:CREATE', 'CUSTOMERS:READ', 'CUSTOMERS:UPDATE', 'DOCUMENTS:UPLOAD', 'DOCUMENTS:READ'],
    FD_OFFICER: ['FIXED_DEPOSITS:CREATE', 'FIXED_DEPOSITS:READ', 'CUSTOMERS:READ', 'DOCUMENTS:UPLOAD', 'DOCUMENTS:READ'],
    CASHIER: ['SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW', 'LOANS:COLLECT', 'SAVINGS:READ', 'LOANS:READ', 'CUSTOMERS:READ'],
    CUSTOMER_SERVICE: ['CUSTOMERS:CREATE', 'CUSTOMERS:READ', 'SAVINGS:CREATE', 'SAVINGS:READ', 'FIXED_DEPOSITS:CREATE', 'FIXED_DEPOSITS:READ', 'DOCUMENTS:UPLOAD', 'DOCUMENTS:READ'],
    ADMIN: permissionData.filter(p => p.module === 'SYSTEM').map(p => p.code).concat(['HR:STAFF_CREATE', 'HR:STAFF_READ', 'HR:STAFF_UPDATE']),
  };

  for (const [roleCode, permCodes] of Object.entries(rolePermissions)) {
    const roleId = roleMap[roleCode];
    for (const permCode of permCodes) {
      const permission = await prisma.permission.findUnique({ where: { code: permCode } });
      if (permission) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: permission.id } },
          update: {},
          create: { roleId, permissionId: permission.id },
        });
      }
    }
  }

  // ============================================================================
  // BRANCHES
  // ============================================================================
  console.log('Creating branches...');

  const branches = [
    { code: 'HQ', name: 'Head Office', address: 'Lagos, Nigeria', phone: '+234-xxx-xxx-xxxx' },
    { code: 'LG01', name: 'Lagos Branch 1', address: 'Victoria Island, Lagos', phone: '+234-xxx-xxx-xxxx' },
  ];

  const branchMap: Record<string, string> = {};
  for (const branch of branches) {
    const b = await prisma.branch.upsert({
      where: { code: branch.code },
      update: {},
      create: branch,
    });
    branchMap[branch.code] = b.id;
  }

  // ============================================================================
  // CHART OF ACCOUNTS
  // ============================================================================
  console.log('Creating chart of accounts...');

  const accounts = [
    // ASSETS (1xxx)
    { code: '1000', name: 'Assets', type: AccountType.ASSET, isHeader: true, normalBalance: BalanceType.DEBIT },
    { code: '1100', name: 'Cash and Bank', type: AccountType.ASSET, parentCode: '1000', normalBalance: BalanceType.DEBIT },
    { code: '1110', name: 'Cash on Hand', type: AccountType.ASSET, parentCode: '1100', normalBalance: BalanceType.DEBIT },
    { code: '1120', name: 'Bank - Operating Account', type: AccountType.ASSET, parentCode: '1100', normalBalance: BalanceType.DEBIT },
    { code: '1130', name: 'Bank - Disbursement Account', type: AccountType.ASSET, parentCode: '1100', normalBalance: BalanceType.DEBIT },
    { code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET, isHeader: true, normalBalance: BalanceType.DEBIT },
    { code: '1300', name: 'Loans Receivable', type: AccountType.ASSET, parentCode: '1200', normalBalance: BalanceType.DEBIT },
    { code: '1310', name: 'Loans - Principal', type: AccountType.ASSET, parentCode: '1300', normalBalance: BalanceType.DEBIT },
    { code: '1320', name: 'Loans - Interest Receivable', type: AccountType.ASSET, parentCode: '1300', normalBalance: BalanceType.DEBIT },
    { code: '1400', name: 'Provision for Bad Debts', type: AccountType.ASSET, parentCode: '1200', normalBalance: BalanceType.CREDIT },
    { code: '1500', name: 'Fixed Assets', type: AccountType.ASSET, isHeader: true, normalBalance: BalanceType.DEBIT },
    { code: '1510', name: 'Furniture and Fittings', type: AccountType.ASSET, parentCode: '1500', normalBalance: BalanceType.DEBIT },
    { code: '1520', name: 'Computer Equipment', type: AccountType.ASSET, parentCode: '1500', normalBalance: BalanceType.DEBIT },
    { code: '1530', name: 'Motor Vehicles', type: AccountType.ASSET, parentCode: '1500', normalBalance: BalanceType.DEBIT },
    { code: '1600', name: 'Accumulated Depreciation', type: AccountType.ASSET, parentCode: '1500', normalBalance: BalanceType.CREDIT },

    // LIABILITIES (2xxx)
    { code: '2000', name: 'Liabilities', type: AccountType.LIABILITY, isHeader: true, normalBalance: BalanceType.CREDIT },
    { code: '2100', name: 'Customer Savings', type: AccountType.LIABILITY, parentCode: '2000', normalBalance: BalanceType.CREDIT },
    { code: '2110', name: 'Savings - Daily', type: AccountType.LIABILITY, parentCode: '2100', normalBalance: BalanceType.CREDIT },
    { code: '2120', name: 'Savings - Target', type: AccountType.LIABILITY, parentCode: '2100', normalBalance: BalanceType.CREDIT },
    { code: '2130', name: 'Savings - Fixed', type: AccountType.LIABILITY, parentCode: '2100', normalBalance: BalanceType.CREDIT },
    { code: '2140', name: 'Savings - Corporate', type: AccountType.LIABILITY, parentCode: '2100', normalBalance: BalanceType.CREDIT },
    { code: '2200', name: 'Fixed Deposits', type: AccountType.LIABILITY, parentCode: '2000', normalBalance: BalanceType.CREDIT },
    { code: '2300', name: 'Interest Payable', type: AccountType.LIABILITY, parentCode: '2000', normalBalance: BalanceType.CREDIT },
    { code: '2400', name: 'Accounts Payable', type: AccountType.LIABILITY, parentCode: '2000', normalBalance: BalanceType.CREDIT },
    { code: '2500', name: 'Taxes Payable', type: AccountType.LIABILITY, parentCode: '2000', normalBalance: BalanceType.CREDIT },

    // EQUITY (3xxx)
    { code: '3000', name: 'Equity', type: AccountType.EQUITY, isHeader: true, normalBalance: BalanceType.CREDIT },
    { code: '3100', name: 'Share Capital', type: AccountType.EQUITY, parentCode: '3000', normalBalance: BalanceType.CREDIT },
    { code: '3200', name: 'Retained Earnings', type: AccountType.EQUITY, parentCode: '3000', normalBalance: BalanceType.CREDIT },
    { code: '3300', name: 'Reserves', type: AccountType.EQUITY, parentCode: '3000', normalBalance: BalanceType.CREDIT },

    // INCOME (4xxx)
    { code: '4000', name: 'Income', type: AccountType.INCOME, isHeader: true, normalBalance: BalanceType.CREDIT },
    { code: '4100', name: 'Interest Income', type: AccountType.INCOME, parentCode: '4000', normalBalance: BalanceType.CREDIT },
    { code: '4110', name: 'Interest Income - Loans', type: AccountType.INCOME, parentCode: '4100', normalBalance: BalanceType.CREDIT },
    { code: '4200', name: 'Fee Income', type: AccountType.INCOME, parentCode: '4000', normalBalance: BalanceType.CREDIT },
    { code: '4210', name: 'Processing Fees', type: AccountType.INCOME, parentCode: '4200', normalBalance: BalanceType.CREDIT },
    { code: '4220', name: 'Insurance Fees', type: AccountType.INCOME, parentCode: '4200', normalBalance: BalanceType.CREDIT },
    { code: '4230', name: 'Late Payment Fees', type: AccountType.INCOME, parentCode: '4200', normalBalance: BalanceType.CREDIT },
    { code: '4300', name: 'Other Income', type: AccountType.INCOME, parentCode: '4000', normalBalance: BalanceType.CREDIT },

    // EXPENSES (5xxx)
    { code: '5000', name: 'Expenses', type: AccountType.EXPENSE, isHeader: true, normalBalance: BalanceType.DEBIT },
    { code: '5100', name: 'Loan Loss Provision', type: AccountType.EXPENSE, parentCode: '5000', normalBalance: BalanceType.DEBIT },
    { code: '5200', name: 'Interest Expense', type: AccountType.EXPENSE, parentCode: '5000', normalBalance: BalanceType.DEBIT },
    { code: '5210', name: 'Interest - Customer Savings', type: AccountType.EXPENSE, parentCode: '5200', normalBalance: BalanceType.DEBIT },
    { code: '5220', name: 'Interest - Fixed Deposits', type: AccountType.EXPENSE, parentCode: '5200', normalBalance: BalanceType.DEBIT },
    { code: '5300', name: 'Salaries and Wages', type: AccountType.EXPENSE, parentCode: '5000', normalBalance: BalanceType.DEBIT },
    { code: '5400', name: 'Rent Expense', type: AccountType.EXPENSE, parentCode: '5000', normalBalance: BalanceType.DEBIT },
    { code: '5500', name: 'Utilities', type: AccountType.EXPENSE, parentCode: '5000', normalBalance: BalanceType.DEBIT },
    { code: '5600', name: 'Office Supplies', type: AccountType.EXPENSE, parentCode: '5000', normalBalance: BalanceType.DEBIT },
    { code: '5700', name: 'Depreciation Expense', type: AccountType.EXPENSE, parentCode: '5000', normalBalance: BalanceType.DEBIT },
    { code: '5800', name: 'Bank Charges', type: AccountType.EXPENSE, parentCode: '5000', normalBalance: BalanceType.DEBIT },
    { code: '5900', name: 'Other Expenses', type: AccountType.EXPENSE, parentCode: '5000', normalBalance: BalanceType.DEBIT },
  ];

  const accountMap: Record<string, string> = {};
  for (const acc of accounts) {
    const { parentCode, ...accountData } = acc;
    const parentId = parentCode ? accountMap[parentCode] : undefined;
    const level = parentCode ? 2 : 1;

    const a = await prisma.chartOfAccounts.upsert({
      where: { accountCode: acc.code },
      update: {},
      create: {
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        normalBalance: acc.normalBalance,
        isHeader: acc.isHeader || false,
        isSystemAccount: true,
        parentId,
        level,
      },
    });
    accountMap[acc.code] = a.id;
  }

  // ============================================================================
  // LOAN PRODUCTS
  // ============================================================================
  console.log('Creating loan products...');

  const loanProducts = [
    { code: 'PERSONAL', name: 'Personal Loan', minAmount: 50000, maxAmount: 5000000, minTenure: 1, maxTenure: 24, interestRate: 24, interestType: 'REDUCING_BALANCE', processingFee: 2 },
    { code: 'SME', name: 'SME Loan', minAmount: 100000, maxAmount: 20000000, minTenure: 3, maxTenure: 36, interestRate: 22, interestType: 'REDUCING_BALANCE', processingFee: 1.5 },
    { code: 'SALARY', name: 'Salary Advance', minAmount: 20000, maxAmount: 1000000, minTenure: 1, maxTenure: 6, interestRate: 5, interestType: 'FLAT', processingFee: 1 },
    { code: 'ASSET', name: 'Asset Finance', minAmount: 500000, maxAmount: 50000000, minTenure: 6, maxTenure: 48, interestRate: 20, interestType: 'REDUCING_BALANCE', processingFee: 2.5 },
  ];

  for (const prod of loanProducts) {
    await prisma.loanProduct.upsert({
      where: { code: prod.code },
      update: {},
      create: {
        ...prod,
        interestType: prod.interestType as any,
      },
    });
  }

  // ============================================================================
  // SAVINGS PRODUCTS
  // ============================================================================
  console.log('Creating savings products...');

  const savingsProducts = [
    { code: 'DAILY', name: 'Daily Savings', savingsType: 'DAILY', minBalance: 0, minDeposit: 100, interestRate: 3, allowWithdrawal: true },
    { code: 'TARGET', name: 'Target Savings', savingsType: 'TARGET', minBalance: 1000, minDeposit: 500, interestRate: 6, allowWithdrawal: false },
    { code: 'CORPORATE', name: 'Corporate Savings', savingsType: 'CORPORATE', minBalance: 50000, minDeposit: 10000, interestRate: 5, allowWithdrawal: true },
  ];

  for (const prod of savingsProducts) {
    await prisma.savingsProduct.upsert({
      where: { code: prod.code },
      update: {},
      create: {
        ...prod,
        savingsType: prod.savingsType as any,
      },
    });
  }

  // ============================================================================
  // FIXED DEPOSIT RATES
  // ============================================================================
  console.log('Creating fixed deposit rates...');

  const fdRates = [
    { minTenure: 30, maxTenure: 90, minAmount: 50000, interestRate: 8 },
    { minTenure: 91, maxTenure: 180, minAmount: 50000, interestRate: 10 },
    { minTenure: 181, maxTenure: 365, minAmount: 50000, interestRate: 12 },
    { minTenure: 366, maxTenure: 730, minAmount: 50000, interestRate: 14 },
  ];

  for (const rate of fdRates) {
    await prisma.fixedDepositRate.create({
      data: rate,
    });
  }

  // ============================================================================
  // DOCUMENT CATEGORIES
  // ============================================================================
  console.log('Creating document categories...');

  const docCategories = [
    { code: 'KYC', name: 'KYC Documents', description: 'Know Your Customer documents' },
    { code: 'LOAN', name: 'Loan Documents', description: 'Loan related documents' },
    { code: 'LEGAL', name: 'Legal Documents', description: 'Legal and compliance documents' },
    { code: 'MOU', name: 'MOUs & Agreements', description: 'Memorandum of Understanding' },
    { code: 'FINANCIAL', name: 'Financial Documents', description: 'Financial statements and reports' },
    { code: 'HR', name: 'HR Documents', description: 'Human resources documents' },
    { code: 'OTHER', name: 'Other Documents', description: 'Miscellaneous documents' },
  ];

  for (const cat of docCategories) {
    await prisma.documentCategory.upsert({
      where: { code: cat.code },
      update: {},
      create: cat,
    });
  }

  // ============================================================================
  // SEQUENCES
  // ============================================================================
  console.log('Creating sequences...');

  const sequences = [
    { code: 'LOAN', prefix: 'LN', padLength: 6 },
    { code: 'SAVINGS_ACCOUNT', prefix: 'SA', padLength: 6 },
    { code: 'SAVINGS_TXN', prefix: 'ST', padLength: 8 },
    { code: 'FIXED_DEPOSIT', prefix: 'FD', padLength: 6 },
    { code: 'CUSTOMER', prefix: 'CU', padLength: 6 },
    { code: 'EMPLOYEE', prefix: 'EMP', padLength: 5 },
    { code: 'JOURNAL', prefix: 'JE', padLength: 8 },
    { code: 'RECEIPT', prefix: 'RC', padLength: 8 },
    { code: 'DOCUMENT', prefix: 'DOC', padLength: 8 },
    { code: 'VERIFICATION', prefix: 'VF', padLength: 6 },
  ];

  for (const seq of sequences) {
    await prisma.sequence.upsert({
      where: { code: seq.code },
      update: {},
      create: seq,
    });
  }

  // ============================================================================
  // ADMIN USER
  // ============================================================================
  console.log('Creating admin user...');

  const adminPassword = await bcrypt.hash('Admin@123', 12);

  await prisma.staff.upsert({
    where: { email: 'admin@hylinkfinance.com' },
    update: {},
    create: {
      employeeId: 'EMP00001',
      email: 'admin@hylinkfinance.com',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      departmentId: deptMap['IT'],
      roleId: roleMap['ADMIN'],
      branchId: branchMap['HQ'],
      status: 'ACTIVE',
      mustChangePassword: true,
    },
  });

  console.log('✅ Database seeding completed!');
  console.log('');
  console.log('Admin Credentials:');
  console.log('  Email: admin@hylinkfinance.com');
  console.log('  Password: Admin@123');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
