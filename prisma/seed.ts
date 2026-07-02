import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Sequences ──────────────────────────────────────────────────────
  const sequences = [
    { code: 'CUSTOMER', prefix: 'CUS', padLength: 6 },
    { code: 'LOAN', prefix: 'LN', padLength: 6 },
    { code: 'RECEIPT', prefix: 'RCP', padLength: 6 },
    { code: 'SAVINGS_ACCOUNT', prefix: 'SAV', padLength: 6 },
    { code: 'SAVINGS_TXN', prefix: 'STX', padLength: 6 },
    { code: 'FIXED_DEPOSIT', prefix: 'FD', padLength: 6 },
    { code: 'JOURNAL', prefix: 'JNL', padLength: 6 },
    { code: 'EMPLOYEE', prefix: 'EMP', padLength: 5 },
    { code: 'DOCUMENT', prefix: 'DOC', padLength: 6 },
    { code: 'RESTRUCTURING', prefix: 'RST', padLength: 6 },
    { code: 'WITHDRAWAL_REQ', prefix: 'WDR', padLength: 6 },
  ];

  for (const seq of sequences) {
    await prisma.sequence.upsert({
      where: { code: seq.code },
      update: {},
      create: { code: seq.code, prefix: seq.prefix, padLength: seq.padLength, currentValue: 0, resetFrequency: 'NEVER' },
    });
    console.log(`  Sequence: ${seq.code} (${seq.prefix})`);
  }

  // ── Permissions ────────────────────────────────────────────────────
  // Format: MODULE:ACTION
  const permissionCodes = [
    // Customer management
    'CUSTOMERS:READ', 'CUSTOMERS:CREATE', 'CUSTOMERS:UPDATE', 'CUSTOMERS:DELETE',
    // Loan lifecycle
    'LOANS:READ', 'LOANS:CREATE', 'LOANS:APPROVE',
    'LOANS:APPROVE_L1', 'LOANS:APPROVE_L2',  // Multi-level approval (Manager / Director)
    'LOANS:DISBURSE', 'LOANS:REPAYMENT', 'LOANS:VERIFY',
    'LOANS:COLLECT', 'LOANS:MANAGE_ALL',     // Payment collection & batch management
    'LOANS:RESTRUCTURE',                     // Loan restructuring (management only)
    // Savings operations
    'SAVINGS:READ', 'SAVINGS:CREATE', 'SAVINGS:TRANSACT',
    'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW',   // Granular transaction permissions
    'SAVINGS:APPROVE',                       // Withdrawal approval (managers+)
    // Fixed deposits
    'FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:CREATE', 'FIXED_DEPOSITS:MANAGE',
    'FIXED_DEPOSITS:LIQUIDATE',              // Early withdrawal / liquidation
    // Accounting & financial reporting
    'ACCOUNTS:COA_MANAGE', 'ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:REPORTS_VIEW',
    'ACCOUNTS:JOURNAL_POST', 'ACCOUNTS:JOURNAL_REVERSE', 'ACCOUNTS:PERIOD_CLOSE',
    // Document management
    'DOCUMENTS:READ', 'DOCUMENTS:CREATE', 'DOCUMENTS:APPROVE', 'DOCUMENTS:DELETE',
    // HR module
    'HR:STAFF_READ', 'HR:STAFF_CREATE', 'HR:STAFF_UPDATE',
    'HR:ATTENDANCE_MANAGE', 'HR:LEAVE_MANAGE', 'HR:PERFORMANCE_MANAGE',
    // Verification field operations
    'VERIFICATION:READ', 'VERIFICATION:PROCESS',
    // Audit & compliance
    'AUDIT:READ',
    // System administration
    'SYSTEM:CONFIG_MANAGE', 'SYSTEM:USER_MANAGE', 'ADMIN:SYSTEM',
  ];

  const permMap: Record<string, string> = {};
  for (const code of permissionCodes) {
    const [module, action] = code.split(':');
    const perm = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, module, action, description: `${action} in ${module}` },
    });
    permMap[code] = perm.id;
  }
  console.log(`  Permissions: ${permissionCodes.length} upserted`);

  // ── Roles & RolePermissions ────────────────────────────────────────
  // Roles match the organizational hierarchy:
  //   Super Admin > Director > HR Admin > Manager > Account Officer >
  //   Loan Officer > Verification Officer > Savings Officer
  const roles = [
    {
      name: 'Super Administrator',
      code: 'SUPER_ADMIN',
      level: 100,
      // All permissions EXCEPT LOANS:CREATE — loan creation is exclusive to Loan Officers
      perms: permissionCodes.filter((p) => p !== 'LOANS:CREATE'),
    },
    {
      name: 'Director',
      code: 'DIRECTOR',
      level: 90,
      perms: [
        // Full operational oversight + final loan approval (L2) — no LOANS:CREATE (Loan Officer only)
        'CUSTOMERS:READ', 'CUSTOMERS:CREATE', 'CUSTOMERS:UPDATE',
        'LOANS:READ', 'LOANS:APPROVE', 'LOANS:APPROVE_L1', 'LOANS:APPROVE_L2',
        'LOANS:DISBURSE', 'LOANS:COLLECT', 'LOANS:MANAGE_ALL', 'LOANS:RESTRUCTURE',
        'SAVINGS:READ', 'SAVINGS:CREATE', 'SAVINGS:TRANSACT', 'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW',
        'SAVINGS:APPROVE',
        'FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:CREATE', 'FIXED_DEPOSITS:MANAGE', 'FIXED_DEPOSITS:LIQUIDATE',
        'ACCOUNTS:COA_MANAGE', 'ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:REPORTS_VIEW',
        'ACCOUNTS:JOURNAL_POST', 'ACCOUNTS:JOURNAL_REVERSE', 'ACCOUNTS:PERIOD_CLOSE',
        'DOCUMENTS:READ', 'DOCUMENTS:CREATE', 'DOCUMENTS:APPROVE',
        'HR:STAFF_READ', 'HR:ATTENDANCE_MANAGE', 'HR:LEAVE_MANAGE', 'HR:PERFORMANCE_MANAGE',
        'VERIFICATION:READ',
        'AUDIT:READ',
      ],
    },
    {
      name: 'HR Administrator',
      code: 'HR_ADMIN',
      level: 80,
      perms: [
        // Full HR module access
        'HR:STAFF_READ', 'HR:STAFF_CREATE', 'HR:STAFF_UPDATE',
        'HR:ATTENDANCE_MANAGE', 'HR:LEAVE_MANAGE', 'HR:PERFORMANCE_MANAGE',
        'DOCUMENTS:READ', 'DOCUMENTS:CREATE',
        'AUDIT:READ',
        'SYSTEM:USER_MANAGE',
      ],
    },
    {
      name: 'Manager',
      code: 'MANAGER',
      level: 70,
      perms: [
        // Branch operations + first-level loan approval (L1) — no LOANS:CREATE (Loan Officer only)
        'CUSTOMERS:READ', 'CUSTOMERS:CREATE', 'CUSTOMERS:UPDATE',
        'LOANS:READ', 'LOANS:APPROVE', 'LOANS:APPROVE_L1',
        'LOANS:DISBURSE', 'LOANS:COLLECT', 'LOANS:MANAGE_ALL', 'LOANS:RESTRUCTURE',
        'SAVINGS:READ', 'SAVINGS:CREATE', 'SAVINGS:TRANSACT', 'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW',
        'SAVINGS:APPROVE',
        'FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:CREATE', 'FIXED_DEPOSITS:MANAGE', 'FIXED_DEPOSITS:LIQUIDATE',
        'ACCOUNTS:REPORTS_VIEW',
        'DOCUMENTS:READ', 'DOCUMENTS:CREATE', 'DOCUMENTS:APPROVE',
        'HR:STAFF_READ', 'HR:ATTENDANCE_MANAGE', 'HR:LEAVE_MANAGE', 'HR:PERFORMANCE_MANAGE',
        'VERIFICATION:READ', 'VERIFICATION:PROCESS',
      ],
    },
    {
      name: 'Account Officer',
      code: 'ACCOUNT_OFFICER',
      level: 60,
      perms: [
        // Chart of accounts, journals, financial reports, period management
        'ACCOUNTS:COA_MANAGE', 'ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:REPORTS_VIEW',
        'ACCOUNTS:JOURNAL_POST', 'ACCOUNTS:JOURNAL_REVERSE', 'ACCOUNTS:PERIOD_CLOSE',
        'LOANS:READ', 'SAVINGS:READ', 'FIXED_DEPOSITS:READ',
        'DOCUMENTS:READ',
      ],
    },
    {
      name: 'Loan Officer',
      code: 'LOAN_OFFICER',
      level: 50,
      perms: [
        // Create and monitor loans
        'CUSTOMERS:READ', 'CUSTOMERS:CREATE', 'CUSTOMERS:UPDATE',
        'LOANS:READ', 'LOANS:CREATE',
        'SAVINGS:READ',
        'DOCUMENTS:READ', 'DOCUMENTS:CREATE',
      ],
    },
    {
      name: 'Verification Officer',
      code: 'VERIFICATION_OFFICER',
      level: 45,
      perms: [
        // Field verification tasks
        'LOANS:VERIFY',
        'CUSTOMERS:READ',
        'DOCUMENTS:READ', 'DOCUMENTS:CREATE',
        'VERIFICATION:READ', 'VERIFICATION:PROCESS',
      ],
    },
    {
      name: 'Savings Officer',
      code: 'SAVINGS_OFFICER',
      level: 40,
      perms: [
        // Savings-only scope — no loan access
        'CUSTOMERS:READ',
        'SAVINGS:READ', 'SAVINGS:CREATE', 'SAVINGS:TRANSACT',
        'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW',
        'FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:CREATE', 'FIXED_DEPOSITS:LIQUIDATE',
        'DOCUMENTS:READ',
      ],
    },
  ];

  for (const role of roles) {
    const dbRole = await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, level: role.level },
      create: { name: role.name, code: role.code, level: role.level, isActive: true },
    });

    // Sync role-permission links (add missing, remove stale)
    const desiredPermIds = role.perms.map((p) => permMap[p]).filter(Boolean);
    for (const permId of desiredPermIds) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: dbRole.id, permissionId: permId } },
        update: {},
        create: { roleId: dbRole.id, permissionId: permId },
      });
    }
    // Remove permissions no longer assigned to this role
    await prisma.rolePermission.deleteMany({
      where: { roleId: dbRole.id, permissionId: { notIn: desiredPermIds } },
    });
    console.log(`  Role: ${role.name} [${role.code}] (level ${role.level}, ${role.perms.length} permissions)`);
  }

  // Deactivate old role codes that no longer match the spec
  const oldRoleCodes = ['BRANCH_MANAGER', 'TELLER', 'ACCOUNTANT', 'AUDITOR'];
  for (const code of oldRoleCodes) {
    const existing = await prisma.role.findUnique({ where: { code } });
    if (existing) {
      // Check if any active staff use this role
      const staffCount = await prisma.staff.count({ where: { roleId: existing.id, status: 'ACTIVE' } });
      if (staffCount === 0) {
        await prisma.role.update({ where: { code }, data: { isActive: false } });
        console.log(`  Deactivated legacy role: ${code}`);
      } else {
        console.log(`  WARNING: Legacy role ${code} still has ${staffCount} active staff — not deactivated`);
      }
    }
  }

  // ── Branch ─────────────────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { code: 'HQ' },
    update: {},
    create: { name: 'Head Office', code: 'HQ', address: 'Lagos, Nigeria', isActive: true },
  });
  console.log(`  Branch: ${branch.name}`);

  // ── Departments ──────────────────────────────────────────────────────
  const departments = [
    { name: 'Administration', code: 'ADMIN' },
    { name: 'Human Resources', code: 'HR' },
    { name: 'Loans', code: 'LOANS' },
    { name: 'Verification', code: 'VERIFICATION' },
    { name: 'Savings', code: 'SAVINGS' },
    { name: 'Accounts', code: 'ACCOUNTS' },
    { name: 'Management', code: 'MANAGEMENT' },
  ];

  let adminDeptId = '';
  for (const dept of departments) {
    const dbDept = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: { name: dept.name, code: dept.code, isActive: true },
    });
    if (dept.code === 'ADMIN') adminDeptId = dbDept.id;
    console.log(`  Department: ${dept.name} [${dept.code}]`);
  }

  // ── Super Admin User ───────────────────────────────────────────────
  const superAdminRole = await prisma.role.findUnique({ where: { code: 'SUPER_ADMIN' } });
  if (superAdminRole) {
    const hashedPassword = await hash('Admin@2024', 12);
    await prisma.staff.upsert({
      where: { email: 'admin@hylinkfinance.com' },
      update: {},
      create: {
        employeeId: 'EMP00001',
        firstName: 'System',
        lastName: 'Administrator',
        email: 'admin@hylinkfinance.com',
        phone: '+2340000000000',
        passwordHash: hashedPassword,
        mustChangePassword: true,
        roleId: superAdminRole.id,
        departmentId: adminDeptId,
        branchId: branch.id,
        status: 'ACTIVE',
      },
    });
    console.log('  Super Admin: admin@hylinkfinance.com / Admin@2024');
  }

  // ── Document Categories ────────────────────────────────────────────
  const docCategories = [
    { name: 'Customer KYC', code: 'KYC' },
    { name: 'Loan Documents', code: 'LOAN_DOCS' },
    { name: 'Collateral', code: 'COLLATERAL' },
    { name: 'Financial Statements', code: 'FINANCIALS' },
    { name: 'Legal', code: 'LEGAL' },
    { name: 'Internal Policies', code: 'POLICIES' },
    { name: 'Reports', code: 'REPORTS' },
    { name: 'HR Documents', code: 'HR_DOCS' },
  ];

  for (const cat of docCategories) {
    await prisma.documentCategory.upsert({
      where: { code: cat.code },
      update: {},
      create: { name: cat.name, code: cat.code, isActive: true },
    });
    console.log(`  Document Category: ${cat.name}`);
  }

  // ── Loan Products ──────────────────────────────────────────────────
  const loanProducts = [
    {
      code: 'PERSONAL',
      name: 'Personal Loan',
      description: 'General-purpose personal loan for individual needs',
      minAmount: 50000,
      maxAmount: 5000000,
      minTenure: 3,
      maxTenure: 36,
      interestRate: 36, // 36% per annum (flat)
      interestType: 'FLAT',
      processingFee: 2,  // 2%
      insuranceFee: 1,   // 1%
      lateFee: 5000,
      gracePeriodDays: 3,
      requiresCollateral: false,
      requiresGuarantor: true,
    },
    {
      code: 'BUSINESS',
      name: 'Business Loan',
      description: 'Working capital and business expansion financing',
      minAmount: 200000,
      maxAmount: 20000000,
      minTenure: 6,
      maxTenure: 60,
      interestRate: 30,
      interestType: 'REDUCING_BALANCE',
      processingFee: 1.5,
      insuranceFee: 0.5,
      lateFee: 10000,
      gracePeriodDays: 5,
      requiresCollateral: true,
      requiresGuarantor: true,
    },
    {
      code: 'EMERGENCY',
      name: 'Emergency Loan',
      description: 'Quick-disbursement loan for urgent needs',
      minAmount: 10000,
      maxAmount: 500000,
      minTenure: 1,
      maxTenure: 12,
      interestRate: 48,
      interestType: 'FLAT',
      processingFee: 3,
      insuranceFee: null,
      lateFee: 2000,
      gracePeriodDays: 0,
      requiresCollateral: false,
      requiresGuarantor: false,
    },
    {
      code: 'SALARY',
      name: 'Salary Advance',
      description: 'Short-term advance against next salary',
      minAmount: 20000,
      maxAmount: 1000000,
      minTenure: 1,
      maxTenure: 6,
      interestRate: 24,
      interestType: 'FLAT',
      processingFee: 1,
      insuranceFee: null,
      lateFee: 3000,
      gracePeriodDays: 2,
      requiresCollateral: false,
      requiresGuarantor: false,
    },
    {
      code: 'ASSET',
      name: 'Asset Finance',
      description: 'Equipment and asset acquisition financing',
      minAmount: 500000,
      maxAmount: 50000000,
      minTenure: 12,
      maxTenure: 84,
      interestRate: 24,
      interestType: 'REDUCING_BALANCE',
      processingFee: 1,
      insuranceFee: 1.5,
      lateFee: 20000,
      gracePeriodDays: 7,
      requiresCollateral: true,
      requiresGuarantor: false,
    },
  ];

  for (const product of loanProducts) {
    await prisma.loanProduct.upsert({
      where: { code: product.code },
      update: {
        name: product.name,
        interestRate: product.interestRate,
        processingFee: product.processingFee,
      },
      create: {
        code: product.code,
        name: product.name,
        description: product.description,
        minAmount: product.minAmount,
        maxAmount: product.maxAmount,
        minTenure: product.minTenure,
        maxTenure: product.maxTenure,
        interestRate: product.interestRate,
        interestType: product.interestType as any,
        processingFee: product.processingFee,
        insuranceFee: product.insuranceFee,
        lateFee: product.lateFee,
        gracePeriodDays: product.gracePeriodDays,
        requiresCollateral: product.requiresCollateral,
        requiresGuarantor: product.requiresGuarantor,
        isActive: true,
      },
    });
    console.log(`  Loan Product: ${product.name} [${product.code}]`);
  }

  // ── Chart of Accounts ────────────────────────────────────────────────────
  console.log('\n[6/6] Chart of Accounts...');

  // Helper: upsert a COA entry
  async function upsertAccount(data: {
    accountCode: string;
    accountName: string;
    accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
    normalBalance: 'DEBIT' | 'CREDIT';
    isHeader?: boolean;
    isSystemAccount?: boolean;
    level?: number;
    parentId?: string;
    description?: string;
  }) {
    return prisma.chartOfAccounts.upsert({
      where: { accountCode: data.accountCode },
      update: { accountName: data.accountName, isActive: true },
      create: {
        accountCode: data.accountCode,
        accountName: data.accountName,
        accountType: data.accountType,
        normalBalance: data.normalBalance,
        isHeader: data.isHeader ?? false,
        isSystemAccount: data.isSystemAccount ?? false,
        level: data.level ?? 1,
        parentId: data.parentId,
        description: data.description,
        isActive: true,
      },
    });
  }

  // Level 1 — Root headers
  const acctAssets     = await upsertAccount({ accountCode: '1000', accountName: 'Total Assets',      accountType: 'ASSET',     normalBalance: 'DEBIT',  isHeader: true, isSystemAccount: true, level: 1 });
  const acctLiab       = await upsertAccount({ accountCode: '2000', accountName: 'Total Liabilities', accountType: 'LIABILITY', normalBalance: 'CREDIT', isHeader: true, isSystemAccount: true, level: 1 });
  const acctEquity     = await upsertAccount({ accountCode: '3000', accountName: 'Equity',            accountType: 'EQUITY',    normalBalance: 'CREDIT', isHeader: true, isSystemAccount: true, level: 1 });
  const acctIncome     = await upsertAccount({ accountCode: '4000', accountName: 'Total Income',      accountType: 'INCOME',    normalBalance: 'CREDIT', isHeader: true, isSystemAccount: true, level: 1 });
  const acctExpenses   = await upsertAccount({ accountCode: '5000', accountName: 'Total Expenses',    accountType: 'EXPENSE',   normalBalance: 'DEBIT',  isHeader: true, isSystemAccount: true, level: 1 });
  console.log('  L1 headers: Assets, Liabilities, Equity, Income, Expenses');

  // Level 2 — Sub-headers
  const acctCurrAssets = await upsertAccount({ accountCode: '1100', accountName: 'Current Assets',      accountType: 'ASSET',     normalBalance: 'DEBIT',  isHeader: true, level: 2, parentId: acctAssets.id });
  const acctLoanPort   = await upsertAccount({ accountCode: '1300', accountName: 'Loan Portfolio',       accountType: 'ASSET',     normalBalance: 'DEBIT',  isHeader: true, level: 2, parentId: acctAssets.id });
  const acctCurrLiab   = await upsertAccount({ accountCode: '2100', accountName: 'Customer Deposits',    accountType: 'LIABILITY', normalBalance: 'CREDIT', isHeader: true, level: 2, parentId: acctLiab.id });
  const acctInterestInc = await upsertAccount({ accountCode: '4100', accountName: 'Interest Income',     accountType: 'INCOME',    normalBalance: 'CREDIT', isHeader: true, level: 2, parentId: acctIncome.id });
  const acctFeeInc     = await upsertAccount({ accountCode: '4200', accountName: 'Fee & Commission Income', accountType: 'INCOME', normalBalance: 'CREDIT', isHeader: true, level: 2, parentId: acctIncome.id });
  const acctPersonnel  = await upsertAccount({ accountCode: '5100', accountName: 'Personnel Expenses',   accountType: 'EXPENSE',   normalBalance: 'DEBIT',  isHeader: true, level: 2, parentId: acctExpenses.id });
  const acctAdmin      = await upsertAccount({ accountCode: '5200', accountName: 'Administrative',       accountType: 'EXPENSE',   normalBalance: 'DEBIT',  isHeader: true, level: 2, parentId: acctExpenses.id });
  const acctCredit     = await upsertAccount({ accountCode: '5300', accountName: 'Credit Expenses',      accountType: 'EXPENSE',   normalBalance: 'DEBIT',  isHeader: true, level: 2, parentId: acctExpenses.id });
  console.log('  L2 sub-headers created');

  // Level 3 — Postable accounts (the ones that actually get debited/credited)
  await upsertAccount({ accountCode: '1110', accountName: 'Cash in Hand',             accountType: 'ASSET',     normalBalance: 'DEBIT',  level: 3, parentId: acctCurrAssets.id, isSystemAccount: true });
  await upsertAccount({ accountCode: '1120', accountName: 'Cash at Bank',             accountType: 'ASSET',     normalBalance: 'DEBIT',  level: 3, parentId: acctCurrAssets.id, isSystemAccount: true, description: 'GL_CASH_BANK' });
  await upsertAccount({ accountCode: '1130', accountName: 'Petty Cash',               accountType: 'ASSET',     normalBalance: 'DEBIT',  level: 3, parentId: acctCurrAssets.id });
  await upsertAccount({ accountCode: '1310', accountName: 'Loans Receivable',         accountType: 'ASSET',     normalBalance: 'DEBIT',  level: 3, parentId: acctLoanPort.id,   isSystemAccount: true, description: 'GL_LOANS_RECEIVABLE' });
  await upsertAccount({ accountCode: '1320', accountName: 'Interest Receivable',      accountType: 'ASSET',     normalBalance: 'DEBIT',  level: 3, parentId: acctLoanPort.id });
  await upsertAccount({ accountCode: '1330', accountName: 'Provision for Loan Losses',accountType: 'ASSET',     normalBalance: 'CREDIT', level: 3, parentId: acctLoanPort.id, description: 'Contra-asset' });

  await upsertAccount({ accountCode: '2110', accountName: 'Customer Savings',         accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 3, parentId: acctCurrLiab.id, isSystemAccount: true });
  await upsertAccount({ accountCode: '2120', accountName: 'Fixed Deposits Payable',   accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 3, parentId: acctCurrLiab.id, isSystemAccount: true });
  await upsertAccount({ accountCode: '2130', accountName: 'Interest Payable',         accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 3, parentId: acctCurrLiab.id });

  await upsertAccount({ accountCode: '3100', accountName: 'Share Capital',            accountType: 'EQUITY',    normalBalance: 'CREDIT', level: 2, parentId: acctEquity.id });
  await upsertAccount({ accountCode: '3200', accountName: 'Retained Earnings',        accountType: 'EQUITY',    normalBalance: 'CREDIT', level: 2, parentId: acctEquity.id });
  await upsertAccount({ accountCode: '3300', accountName: 'Current Year Profit',      accountType: 'EQUITY',    normalBalance: 'CREDIT', level: 2, parentId: acctEquity.id });

  await upsertAccount({ accountCode: '4110', accountName: 'Loan Interest Income',     accountType: 'INCOME',    normalBalance: 'CREDIT', level: 3, parentId: acctInterestInc.id, isSystemAccount: true, description: 'GL_INTEREST_INCOME' });
  await upsertAccount({ accountCode: '4120', accountName: 'Fixed Deposit Interest',   accountType: 'INCOME',    normalBalance: 'CREDIT', level: 3, parentId: acctInterestInc.id });
  await upsertAccount({ accountCode: '4210', accountName: 'Processing & Admin Fees',  accountType: 'INCOME',    normalBalance: 'CREDIT', level: 3, parentId: acctFeeInc.id,       isSystemAccount: true, description: 'GL_FEE_INCOME' });
  await upsertAccount({ accountCode: '4220', accountName: 'Penalty & Late Fees',      accountType: 'INCOME',    normalBalance: 'CREDIT', level: 3, parentId: acctFeeInc.id });

  await upsertAccount({ accountCode: '5110', accountName: 'Salaries & Wages',         accountType: 'EXPENSE',   normalBalance: 'DEBIT',  level: 3, parentId: acctPersonnel.id });
  await upsertAccount({ accountCode: '5120', accountName: 'Staff Benefits',           accountType: 'EXPENSE',   normalBalance: 'DEBIT',  level: 3, parentId: acctPersonnel.id });
  await upsertAccount({ accountCode: '5210', accountName: 'Rent & Utilities',         accountType: 'EXPENSE',   normalBalance: 'DEBIT',  level: 3, parentId: acctAdmin.id });
  await upsertAccount({ accountCode: '5220', accountName: 'Office Supplies',          accountType: 'EXPENSE',   normalBalance: 'DEBIT',  level: 3, parentId: acctAdmin.id });
  await upsertAccount({ accountCode: '5310', accountName: 'Bad Debt Expense',         accountType: 'EXPENSE',   normalBalance: 'DEBIT',  level: 3, parentId: acctCredit.id,      isSystemAccount: true, description: 'GL_BAD_DEBT' });
  await upsertAccount({ accountCode: '5320', accountName: 'Savings Interest Expense', accountType: 'EXPENSE',   normalBalance: 'DEBIT',  level: 3, parentId: acctCredit.id });

  console.log('  Postable accounts created (1110-5320)');
  console.log('  Key GL codes: 1120=Cash/Bank, 1310=Loans Receivable, 4110=Interest Income, 4210=Fee Income, 5310=Bad Debt');

  // ── Savings Products ─────────────────────────────────────────────────────
  console.log('\n[7/8] Savings Products...');

  const savingsProducts = [
    {
      code: 'REGULAR_SAVINGS',
      name: 'Regular Savings Account',
      description: 'Standard individual savings account with daily deposits',
      savingsType: 'DAILY',
      minBalance: 1000,
      minDeposit: 500,
      maxDailyWithdrawal: 50000,
      interestRate: 3.5,
      interestFrequency: 'MONTHLY',
      allowWithdrawal: true,
      withdrawalNotice: 0,
      monthlyFee: 0,
      transactionFee: 0,
    },
    {
      code: 'TARGET_SAVINGS',
      name: 'Target Savings Account',
      description: 'Goal-oriented savings with restricted withdrawals',
      savingsType: 'TARGET',
      minBalance: 0,
      minDeposit: 1000,
      maxDailyWithdrawal: null,
      interestRate: 5.0,
      interestFrequency: 'QUARTERLY',
      allowWithdrawal: false,
      withdrawalNotice: 30,
      monthlyFee: 0,
      transactionFee: 0,
    },
    {
      code: 'CURRENT_ACCOUNT',
      name: 'Current Account',
      description: 'Business/corporate current account with unlimited transactions',
      savingsType: 'CURRENT',
      minBalance: 10000,
      minDeposit: 5000,
      maxDailyWithdrawal: null,
      interestRate: 0,
      interestFrequency: 'MONTHLY',
      allowWithdrawal: true,
      withdrawalNotice: 0,
      monthlyFee: 500,
      transactionFee: 50,
    },
    {
      code: 'JUNIOR_SAVINGS',
      name: 'Junior Savings Account',
      description: 'Children\'s savings account with parental controls',
      savingsType: 'JUNIOR',
      minBalance: 500,
      minDeposit: 200,
      maxDailyWithdrawal: 10000,
      interestRate: 4.0,
      interestFrequency: 'ANNUALLY',
      allowWithdrawal: true,
      withdrawalNotice: 0,
      monthlyFee: 0,
      transactionFee: 0,
    },
  ];

  for (const product of savingsProducts) {
    await prisma.savingsProduct.upsert({
      where: { code: product.code },
      update: { name: product.name, interestRate: product.interestRate, isActive: true },
      create: {
        code: product.code,
        name: product.name,
        description: product.description,
        savingsType: product.savingsType as any,
        minBalance: product.minBalance,
        minDeposit: product.minDeposit,
        maxDailyWithdrawal: product.maxDailyWithdrawal,
        interestRate: product.interestRate,
        interestFrequency: product.interestFrequency as any,
        allowWithdrawal: product.allowWithdrawal,
        withdrawalNotice: product.withdrawalNotice,
        monthlyFee: product.monthlyFee,
        transactionFee: product.transactionFee,
        isActive: true,
      },
    });
    console.log(`  Savings Product: ${product.name} [${product.code}]`);
  }

  // ── Fixed Deposit Rates ──────────────────────────────────────────────────
  console.log('\n[8/8] Fixed Deposit Rates...');

  const fdRates = [
    { minTenure: 30,  maxTenure: 90,  minAmount: 100000, maxAmount: null,      interestRate: 8.0  },
    { minTenure: 91,  maxTenure: 180, minAmount: 100000, maxAmount: null,      interestRate: 10.0 },
    { minTenure: 181, maxTenure: 365, minAmount: 50000,  maxAmount: null,      interestRate: 12.0 },
    { minTenure: 366, maxTenure: 730, minAmount: 50000,  maxAmount: null,      interestRate: 14.0 },
  ];

  for (const rate of fdRates) {
    // Upsert by tenure range since there is no unique code field
    const existing = await prisma.fixedDepositRate.findFirst({
      where: { minTenure: rate.minTenure, maxTenure: rate.maxTenure },
    });
    if (existing) {
      await prisma.fixedDepositRate.update({
        where: { id: existing.id },
        data: { interestRate: rate.interestRate, isActive: true },
      });
    } else {
      await prisma.fixedDepositRate.create({
        data: {
          minTenure: rate.minTenure,
          maxTenure: rate.maxTenure,
          minAmount: rate.minAmount,
          maxAmount: rate.maxAmount,
          interestRate: rate.interestRate,
          isActive: true,
          effectiveFrom: new Date(),
        },
      });
    }
    console.log(`  FD Rate: ${rate.minTenure}–${rate.maxTenure} days @ ${rate.interestRate}%`);
  }

  console.log('\nSeed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
