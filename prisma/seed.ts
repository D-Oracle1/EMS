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
    // HR module — core
    'HR:STAFF_READ', 'HR:STAFF_CREATE', 'HR:STAFF_UPDATE',
    'HR:ATTENDANCE_MANAGE', 'HR:LEAVE_MANAGE', 'HR:PERFORMANCE_MANAGE',
    // HR module — payroll (separated so processing and approval can be split)
    'HR:PAYROLL_READ', 'HR:PAYROLL_MANAGE', 'HR:PAYROLL_APPROVE',
    // HR module — talent, assets, communication and configuration
    'HR:RECRUITMENT_MANAGE', 'HR:TRAINING_MANAGE', 'HR:ASSET_MANAGE',
    'HR:ANNOUNCE', 'HR:CONFIG_MANAGE', 'HR:ANALYTICS_VIEW',
    // Verification field operations
    'VERIFICATION:READ', 'VERIFICATION:PROCESS',
    // CMS — the public marketing site, owned by IT
    'CMS:READ', 'CMS:CONTENT_MANAGE', 'CMS:POST_MANAGE', 'CMS:PUBLISH',
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
        'HR:PAYROLL_READ', 'HR:PAYROLL_APPROVE', 'HR:ANALYTICS_VIEW',
        'HR:RECRUITMENT_MANAGE', 'HR:ANNOUNCE',
        'CMS:READ',
        'VERIFICATION:READ',
        'AUDIT:READ',
      ],
    },
    {
      name: 'HR Administrator',
      code: 'HR_ADMIN',
      level: 80,
      perms: [
        // Full HR module access. Payroll can be processed here but NOT approved —
        // approval sits with the Director so no one person can run and release pay.
        'HR:STAFF_READ', 'HR:STAFF_CREATE', 'HR:STAFF_UPDATE',
        'HR:ATTENDANCE_MANAGE', 'HR:LEAVE_MANAGE', 'HR:PERFORMANCE_MANAGE',
        'HR:PAYROLL_READ', 'HR:PAYROLL_MANAGE',
        'HR:RECRUITMENT_MANAGE', 'HR:TRAINING_MANAGE', 'HR:ASSET_MANAGE',
        'HR:ANNOUNCE', 'HR:CONFIG_MANAGE', 'HR:ANALYTICS_VIEW',
        'DOCUMENTS:READ', 'DOCUMENTS:CREATE',
        'AUDIT:READ',
        'SYSTEM:USER_MANAGE',
      ],
    },
    {
      name: 'IT Administrator',
      code: 'IT_ADMIN',
      level: 55,
      perms: [
        // Owns the public website: content, posts and publishing.
        'CMS:READ', 'CMS:CONTENT_MANAGE', 'CMS:POST_MANAGE', 'CMS:PUBLISH',
        // IT also needs to see the audit trail and system configuration, but
        // deliberately holds no customer, lending, savings or HR access.
        'AUDIT:READ',
        'SYSTEM:CONFIG_MANAGE',
        'DOCUMENTS:READ',
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
        'HR:ANALYTICS_VIEW', 'HR:TRAINING_MANAGE', 'HR:ASSET_MANAGE',
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
    { name: 'Information Technology', code: 'IT' },
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
  const acctOtherLiab  = await upsertAccount({ accountCode: '2200', accountName: 'Other Liabilities',     accountType: 'LIABILITY', normalBalance: 'CREDIT', isHeader: true, level: 2, parentId: acctLiab.id });
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

  // Payroll settlement accounts — credited by the monthly payroll accrual and
  // cleared when salaries, PAYE and pension contributions are actually remitted.
  await upsertAccount({ accountCode: '2210', accountName: 'Salaries Payable',        accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 3, parentId: acctOtherLiab.id, isSystemAccount: true, description: 'GL_SALARY_PAYABLE' });
  await upsertAccount({ accountCode: '2220', accountName: 'PAYE Payable',            accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 3, parentId: acctOtherLiab.id, isSystemAccount: true, description: 'GL_PAYE_PAYABLE' });
  await upsertAccount({ accountCode: '2230', accountName: 'Pension Payable',         accountType: 'LIABILITY', normalBalance: 'CREDIT', level: 3, parentId: acctOtherLiab.id, isSystemAccount: true, description: 'GL_PENSION_PAYABLE' });

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
  console.log('  Payroll GL codes: 5110=Salaries Expense, 2210=Salaries Payable, 2220=PAYE Payable, 2230=Pension Payable');

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


  // ══════════════════════════════════════════════════════════════════════
  // HR MODULE REFERENCE DATA
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n[9/12] HR — Leave Types...');

  const leaveTypes = [
    { code: 'ANNUAL',       name: 'Annual Leave',        defaultDays: 20, isPaid: true,  carryForward: true,  maxCarryForwardDays: 5,  minServiceMonths: 6,  colorHex: '#0ea5e9', sortOrder: 1 },
    { code: 'SICK',         name: 'Sick Leave',          defaultDays: 12, isPaid: true,  requiresDocument: true, colorHex: '#ef4444', sortOrder: 2 },
    { code: 'CASUAL',       name: 'Casual Leave',        defaultDays: 5,  isPaid: true,  allowHalfDay: true, colorHex: '#f59e0b', sortOrder: 3 },
    { code: 'MATERNITY',    name: 'Maternity Leave',     defaultDays: 84, isPaid: true,  genderRestriction: 'FEMALE', minServiceMonths: 12, countsWeekends: true, colorHex: '#ec4899', sortOrder: 4 },
    { code: 'PATERNITY',    name: 'Paternity Leave',     defaultDays: 10, isPaid: true,  genderRestriction: 'MALE',   minServiceMonths: 12, colorHex: '#8b5cf6', sortOrder: 5 },
    { code: 'COMPASSIONATE',name: 'Compassionate Leave', defaultDays: 5,  isPaid: true,  colorHex: '#64748b', sortOrder: 6 },
    { code: 'STUDY',        name: 'Study Leave',         defaultDays: 10, isPaid: true,  requiresDocument: true, minServiceMonths: 24, colorHex: '#14b8a6', sortOrder: 7 },
    { code: 'UNPAID',       name: 'Unpaid Leave',        defaultDays: 0,  isPaid: false, colorHex: '#94a3b8', sortOrder: 8 },
  ];

  for (const lt of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { code: lt.code },
      update: { name: lt.name, defaultDays: lt.defaultDays, isPaid: lt.isPaid },
      create: {
        code: lt.code,
        name: lt.name,
        defaultDays: lt.defaultDays,
        isPaid: lt.isPaid,
        carryForward: lt.carryForward ?? false,
        maxCarryForwardDays: lt.maxCarryForwardDays ?? 0,
        requiresDocument: lt.requiresDocument ?? false,
        allowHalfDay: lt.allowHalfDay ?? false,
        minServiceMonths: lt.minServiceMonths ?? 0,
        genderRestriction: lt.genderRestriction ?? null,
        countsWeekends: lt.countsWeekends ?? false,
        colorHex: lt.colorHex,
        sortOrder: lt.sortOrder,
        isActive: true,
      },
    });
    console.log(`  Leave type: ${lt.name} (${lt.defaultDays} days)`);
  }

  // ── Work shift ───────────────────────────────────────────────────────
  console.log('\n[10/12] HR — Work Shifts & Holidays...');

  await prisma.workShift.upsert({
    where: { code: 'STANDARD' },
    update: {},
    create: {
      code: 'STANDARD',
      name: 'Standard Day Shift',
      startTime: '08:00',
      endTime: '17:00',
      graceMinutes: 15,
      breakMinutes: 60,
      workDays: [1, 2, 3, 4, 5],
      isDefault: true,
      isActive: true,
    },
  });
  console.log('  Work shift: Standard Day Shift (08:00-17:00, Mon-Fri)');

  // ── Nigerian public holidays (recurring fixed-date ones only) ─────────
  const holidayYear = new Date().getFullYear();
  const holidays = [
    { name: 'New Year Day',      month: 1,  day: 1 },
    { name: 'Workers Day',       month: 5,  day: 1 },
    { name: 'Democracy Day',     month: 6,  day: 12 },
    { name: 'Independence Day',  month: 10, day: 1 },
    { name: 'Christmas Day',     month: 12, day: 25 },
    { name: 'Boxing Day',        month: 12, day: 26 },
  ];

  for (const h of holidays) {
    const date = new Date(holidayYear, h.month - 1, h.day);
    const existing = await prisma.holiday.findFirst({ where: { name: h.name, date } });
    if (!existing) {
      await prisma.holiday.create({
        data: { name: h.name, date, isRecurring: true, description: 'Nigerian public holiday' },
      });
    }
  }
  console.log(`  Holidays: ${holidays.length} recurring public holidays for ${holidayYear}`);

  // ── Salary grades ────────────────────────────────────────────────────
  console.log('\n[11/12] HR — Salary Grades & Payroll Components...');

  const grades = [
    { code: 'EXEC',   name: 'Executive',        level: 90, minGross: 1500000, maxGross: 5000000, annualLeaveDays: 30 },
    { code: 'MGT',    name: 'Management',       level: 70, minGross: 700000,  maxGross: 1500000, annualLeaveDays: 25 },
    { code: 'SNR',    name: 'Senior Officer',   level: 50, minGross: 350000,  maxGross: 700000,  annualLeaveDays: 22 },
    { code: 'OFF',    name: 'Officer',          level: 30, minGross: 180000,  maxGross: 350000,  annualLeaveDays: 20 },
    { code: 'JNR',    name: 'Junior Officer',   level: 20, minGross: 90000,   maxGross: 180000,  annualLeaveDays: 18 },
    { code: 'SUPPORT',name: 'Support Staff',    level: 10, minGross: 50000,   maxGross: 90000,   annualLeaveDays: 15 },
  ];

  for (const g of grades) {
    await prisma.salaryGrade.upsert({
      where: { code: g.code },
      update: { name: g.name, level: g.level },
      create: { ...g, isActive: true },
    });
    console.log(`  Grade: ${g.name} [${g.code}] level ${g.level}`);
  }

  // ── Payroll components ───────────────────────────────────────────────
  // BASIC, PAYE, PENSION_EE/ER, NHF and LOP are computed by the payroll
  // engine itself, so only the discretionary allowances live here.
  const components = [
    { code: 'HOUSING',    name: 'Housing Allowance',    type: 'EARNING',   calculationType: 'PERCENT_OF_BASIC', defaultValue: 30, isTaxable: true,  isPensionable: true,  sortOrder: 10 },
    { code: 'TRANSPORT',  name: 'Transport Allowance',  type: 'EARNING',   calculationType: 'PERCENT_OF_BASIC', defaultValue: 20, isTaxable: true,  isPensionable: true,  sortOrder: 20 },
    { code: 'UTILITY',    name: 'Utility Allowance',    type: 'EARNING',   calculationType: 'PERCENT_OF_BASIC', defaultValue: 10, isTaxable: true,  isPensionable: false, sortOrder: 30 },
    { code: 'MEAL',       name: 'Meal Allowance',       type: 'EARNING',   calculationType: 'FIXED',            defaultValue: 0,  isTaxable: true,  isPensionable: false, sortOrder: 40 },
    { code: 'LEAVE_ALLW', name: 'Leave Allowance',      type: 'EARNING',   calculationType: 'PERCENT_OF_BASIC', defaultValue: 10, isTaxable: true,  isPensionable: false, sortOrder: 50 },
    { code: 'STAFF_LOAN', name: 'Staff Loan Repayment', type: 'DEDUCTION', calculationType: 'FIXED',            defaultValue: 0,  isTaxable: false, isPensionable: false, sortOrder: 10 },
    { code: 'COOP',       name: 'Cooperative Deduction',type: 'DEDUCTION', calculationType: 'FIXED',            defaultValue: 0,  isTaxable: false, isPensionable: false, sortOrder: 20 },
    { code: 'NHIS_ER',    name: 'NHIS (Employer)',      type: 'EMPLOYER_CONTRIBUTION', calculationType: 'PERCENT_OF_BASIC', defaultValue: 5, isTaxable: false, isPensionable: false, sortOrder: 10 },
  ];

  for (const c of components) {
    await prisma.payrollComponent.upsert({
      where: { code: c.code },
      update: { name: c.name },
      create: {
        code: c.code,
        name: c.name,
        type: c.type as any,
        calculationType: c.calculationType as any,
        defaultValue: c.defaultValue,
        isTaxable: c.isTaxable,
        isPensionable: c.isPensionable,
        sortOrder: c.sortOrder,
        glAccountCode: c.type === 'EARNING' ? '5110' : c.type === 'EMPLOYER_CONTRIBUTION' ? '5120' : null,
        isActive: true,
      },
    });
    console.log(`  Payroll component: ${c.name} [${c.code}]`);
  }

  // ── Onboarding / offboarding templates ───────────────────────────────
  console.log('\n[12/12] HR — Onboarding Templates...');

  const onboardingTemplate = await prisma.onboardingTemplate.findFirst({
    where: { name: 'Standard Employee Onboarding', type: 'ONBOARDING' },
  });
  if (!onboardingTemplate) {
    await prisma.onboardingTemplate.create({
      data: {
        name: 'Standard Employee Onboarding',
        type: 'ONBOARDING',
        description: 'Default checklist applied to every new hire.',
        isActive: true,
        tasks: {
          create: [
            { title: 'Signed offer letter and contract on file', category: 'HR',         dueDayOffset: 0,  ownerRoleCode: 'HR_ADMIN', sortOrder: 0 },
            { title: 'Collect statutory documents (BVN, NIN, TIN)', category: 'COMPLIANCE', dueDayOffset: 1, ownerRoleCode: 'HR_ADMIN', sortOrder: 1 },
            { title: 'Create system login and assign role',       category: 'IT',         dueDayOffset: 1,  ownerRoleCode: 'SUPER_ADMIN', sortOrder: 2 },
            { title: 'Issue laptop and access card',              category: 'IT',         dueDayOffset: 1,  ownerRoleCode: 'SUPER_ADMIN', sortOrder: 3 },
            { title: 'Register bank and pension details',         category: 'FINANCE',    dueDayOffset: 3,  ownerRoleCode: 'HR_ADMIN', sortOrder: 4 },
            { title: 'Set up salary package in payroll',          category: 'FINANCE',    dueDayOffset: 5,  ownerRoleCode: 'HR_ADMIN', sortOrder: 5 },
            { title: 'Company orientation and policy briefing',   category: 'TRAINING',   dueDayOffset: 5,  ownerRoleCode: 'HR_ADMIN', sortOrder: 6 },
            { title: 'Introduce to team and assign supervisor',   category: 'GENERAL',    dueDayOffset: 2,  sortOrder: 7 },
            { title: 'Set first-quarter performance goals',       category: 'GENERAL',    dueDayOffset: 14, sortOrder: 8 },
            { title: 'Schedule 30-day probation check-in',        category: 'HR',         dueDayOffset: 30, ownerRoleCode: 'HR_ADMIN', sortOrder: 9 },
          ],
        },
      },
    });
    console.log('  Onboarding template: Standard Employee Onboarding (10 tasks)');
  }

  const offboardingTemplate = await prisma.onboardingTemplate.findFirst({
    where: { name: 'Standard Employee Exit', type: 'OFFBOARDING' },
  });
  if (!offboardingTemplate) {
    await prisma.onboardingTemplate.create({
      data: {
        name: 'Standard Employee Exit',
        type: 'OFFBOARDING',
        description: 'Clearance checklist completed before an exit is finalised.',
        isActive: true,
        tasks: {
          create: [
            { title: 'Acknowledge resignation / issue exit letter', category: 'HR',        dueDayOffset: 0,  ownerRoleCode: 'HR_ADMIN', sortOrder: 0 },
            { title: 'Handover notes and work-in-progress list',    category: 'GENERAL',   dueDayOffset: 7,  sortOrder: 1 },
            { title: 'Return laptop, access card and phone',        category: 'IT',        dueDayOffset: 14, ownerRoleCode: 'SUPER_ADMIN', sortOrder: 2 },
            { title: 'Revoke system access and revoke sessions',    category: 'IT',        dueDayOffset: 14, ownerRoleCode: 'SUPER_ADMIN', sortOrder: 3 },
            { title: 'Clear outstanding staff loans and advances',  category: 'FINANCE',   dueDayOffset: 14, ownerRoleCode: 'ACCOUNT_OFFICER', sortOrder: 4 },
            { title: 'Compute final settlement and leave payout',   category: 'FINANCE',   dueDayOffset: 14, ownerRoleCode: 'HR_ADMIN', sortOrder: 5 },
            { title: 'Conduct exit interview',                      category: 'HR',        dueDayOffset: 13, ownerRoleCode: 'HR_ADMIN', sortOrder: 6 },
            { title: 'Issue reference / service letter',            category: 'HR',        dueDayOffset: 20, ownerRoleCode: 'HR_ADMIN', isMandatory: false, sortOrder: 7 },
          ],
        },
      },
    });
    console.log('  Offboarding template: Standard Employee Exit (8 tasks)');
  }


  // ══════════════════════════════════════════════════════════════════════
  // CMS — EDITABLE MARKETING SITE CONTENT
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n[13/13] CMS — Site Content...');

  // Each block is one slot on the public site. `defaultValue` keeps the copy
  // the site shipped with, so any edit can be reverted without a developer.
  const contentBlocks = [
    { key: 'home.hero.eyebrow',    page: 'home',     label: 'Hero eyebrow',       type: 'TEXT',     value: 'Secure your financial future', sortOrder: 1 },
    { key: 'home.hero.title',      page: 'home',     label: 'Hero headline',      type: 'TEXT',     value: 'Grow your money with people who pick up the phone.', sortOrder: 2 },
    { key: 'home.hero.body',       page: 'home',     label: 'Hero paragraph',     type: 'RICHTEXT', value: 'Savings, fixed deposits, mutual funding and debt financing - managed in one place.', sortOrder: 3 },
    { key: 'home.hero.cta',        page: 'home',     label: 'Hero button label',  type: 'TEXT',     value: 'Open an account', sortOrder: 4 },

    { key: 'home.stats.clients',   page: 'home',     label: 'Clients served',     type: 'TEXT',     value: '1,000+', sortOrder: 10 },
    { key: 'home.stats.years',     page: 'home',     label: 'Years of trust',     type: 'TEXT',     value: '5+',     sortOrder: 11 },
    { key: 'home.stats.disbursed', page: 'home',     label: 'Funds disbursed',    type: 'TEXT',     value: '\u20A61B+', sortOrder: 12 },

    { key: 'home.services.title',  page: 'home',     label: 'Services heading',   type: 'TEXT',     value: 'Our Services', sortOrder: 20 },
    { key: 'home.services.body',   page: 'home',     label: 'Services intro',     type: 'RICHTEXT', value: 'Everything you need to save, grow and borrow - under one roof.', sortOrder: 21 },

    { key: 'contact.phone',        page: 'contact',  label: 'Phone number',       type: 'TEXT',     value: '+234 800 000 0000', sortOrder: 30 },
    { key: 'contact.email',        page: 'contact',  label: 'Email address',      type: 'TEXT',     value: 'info@hylinkfinance.com', sortOrder: 31 },
    { key: 'contact.address',      page: 'contact',  label: 'Office address',     type: 'RICHTEXT', value: 'Lagos, Nigeria', sortOrder: 32 },
    { key: 'contact.hours',        page: 'contact',  label: 'Opening hours',      type: 'TEXT',     value: 'Mon-Fri, 8am - 5pm', sortOrder: 33 },

    { key: 'about.title',          page: 'about',    label: 'About heading',      type: 'TEXT',     value: 'Built on real relationships', sortOrder: 40 },
    { key: 'about.body',           page: 'about',    label: 'About paragraph',    type: 'RICHTEXT', value: 'Every account is opened by an officer who knows your file.', sortOrder: 41 },
  ];

  for (const block of contentBlocks) {
    await prisma.contentBlock.upsert({
      where: { key: block.key },
      // Never overwrite an editor's change on a re-seed; only backfill the
      // default so a revert always has something to fall back to.
      update: { defaultValue: block.value, label: block.label, page: block.page },
      create: {
        key: block.key,
        page: block.page,
        label: block.label,
        type: block.type,
        value: block.value,
        defaultValue: block.value,
        sortOrder: block.sortOrder,
        isPublished: true,
      },
    });
  }
  console.log(`  Content blocks: ${contentBlocks.length} upserted`);

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
