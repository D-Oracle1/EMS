/**
 * Generates HYLINK_EMS_DOCUMENTATION.docx
 * Run: node scripts/generate-docs.mjs
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType,
  PageBreak, TableOfContents, StyleLevel, LevelFormat, NumberFormat,
  Header, Footer, PageNumber,
} from 'docx';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'docs', 'HYLINK_EMS_DOCUMENTATION.docx');

// ── Colour palette ───────────────────────────────────────────────────────────
const BRAND_BLUE   = '1E3A5F';
const BRAND_GOLD   = 'C9A84C';
const LIGHT_GREY   = 'F2F4F7';
const MID_GREY     = 'D1D5DB';
const WHITE        = 'FFFFFF';
const DARK_TEXT    = '1F2937';
const CODE_BG      = 'F3F4F6';
const CODE_TEXT    = '374151';

// ── Helper builders ──────────────────────────────────────────────────────────
const h1 = (text) => new Paragraph({
  text, heading: HeadingLevel.HEADING_1,
  spacing: { before: 400, after: 200 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND_GOLD, space: 6 } },
});

const h2 = (text) => new Paragraph({
  text, heading: HeadingLevel.HEADING_2,
  spacing: { before: 300, after: 120 },
});

const h3 = (text) => new Paragraph({
  text, heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 80 },
});

const body = (text, { bold = false, colour = DARK_TEXT, size = 22 } = {}) =>
  new Paragraph({
    spacing: { before: 60, after: 60, line: 320 },
    children: [new TextRun({ text, bold, color: colour, size, font: 'Calibri' })],
  });

const bullet = (text, level = 0) => new Paragraph({
  bullet: { level },
  spacing: { before: 40, after: 40 },
  children: [new TextRun({ text, size: 22, font: 'Calibri', color: DARK_TEXT })],
});

const code = (text) => new Paragraph({
  spacing: { before: 40, after: 40 },
  shading: { type: ShadingType.SOLID, color: CODE_BG },
  children: [new TextRun({ text, font: 'Courier New', size: 20, color: CODE_TEXT })],
});

const divider = () => new Paragraph({
  spacing: { before: 200, after: 200 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MID_GREY } },
  children: [],
});

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const label = (l, v) => new Paragraph({
  spacing: { before: 50, after: 50 },
  children: [
    new TextRun({ text: `${l}: `, bold: true, size: 22, font: 'Calibri', color: BRAND_BLUE }),
    new TextRun({ text: v, size: 22, font: 'Calibri', color: DARK_TEXT }),
  ],
});

// ── Table builder ────────────────────────────────────────────────────────────
function makeTable(headers, rows) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) => new TableCell({
      shading: { type: ShadingType.SOLID, color: BRAND_BLUE },
      children: [new Paragraph({
        children: [new TextRun({ text: h, bold: true, color: WHITE, size: 20, font: 'Calibri' })],
      })],
    })),
  });

  const dataRows = rows.map((row, i) => new TableRow({
    children: row.map((cell) => new TableCell({
      shading: { type: ShadingType.SOLID, color: i % 2 === 0 ? WHITE : LIGHT_GREY },
      children: [new Paragraph({
        children: [new TextRun({ text: String(cell), size: 20, font: 'Calibri', color: DARK_TEXT })],
        spacing: { before: 40, after: 40 },
      })],
    })),
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ── Cover Page ───────────────────────────────────────────────────────────────
const coverPage = [
  new Paragraph({ spacing: { before: 1800 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [new TextRun({
      text: 'HYLINK FINANCE LIMITED',
      bold: true, allCaps: true, size: 56, color: BRAND_BLUE, font: 'Calibri',
    })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND_GOLD } },
    children: [new TextRun({
      text: 'Enterprise Management System', bold: false, size: 36, color: BRAND_GOLD, font: 'Calibri',
    })],
  }),
  new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'TECHNICAL & FUNCTIONAL DOCUMENTATION', size: 26, color: MID_GREY, font: 'Calibri', allCaps: true })],
  }),
  new Paragraph({ spacing: { before: 600 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Version 2.0.0', size: 24, color: DARK_TEXT, font: 'Calibri', bold: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'March 2026', size: 24, color: DARK_TEXT, font: 'Calibri' })],
  }),
  new Paragraph({ spacing: { before: 200 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'CONFIDENTIAL — INTERNAL USE ONLY', size: 20, color: 'CC0000', font: 'Calibri', bold: true, allCaps: true })],
  }),
  pageBreak(),
];

// ── Section 1: Project Overview ───────────────────────────────────────────────
const section1 = [
  h1('1. Project Overview'),
  label('System Name',  'Hylink Finance Limited — Enterprise Management System'),
  label('Short Name',   'Hylink EMS'),
  label('Version',      '2.0.0'),
  label('Type',         'Full-Stack Web Application (Progressive Web App)'),
  label('Organisation', 'Hylink Finance Limited'),
  label('Currency',     'Nigerian Naira (NGN)'),
  label('Database',     'PostgreSQL 16'),
  label('Repository',   'github.com/D-Oracle1/EMS'),
  body(''),
  h2('Description'),
  body('Hylink EMS is a comprehensive internal management platform for a financial institution. It covers the complete lifecycle of lending, savings, fixed deposits, HR operations, double-entry accounting, document archiving, field verification, audit compliance, and role-based access control — all within a single, unified Next.js 16 application.'),
  body(''),
  h2('Design Principles'),
  bullet('Audit-ready — every action is logged with who, what, when, and IP address'),
  bullet('Double-entry clean — all financial transactions post balanced journal entries'),
  bullet('Role-gated — granular permissions per module and action'),
  bullet('Offline-capable — PWA service worker caches critical assets'),
  bullet('Multi-branch — branches, departments, and supervisory hierarchies supported'),
  bullet('Soft-delete — key records are never hard-deleted, preserving full audit trail'),
  pageBreak(),
];

// ── Section 2: Technology Stack ───────────────────────────────────────────────
const section2 = [
  h1('2. Technology Stack'),
  makeTable(
    ['Category', 'Technology', 'Version'],
    [
      ['Runtime & Framework', 'Next.js (App Router, Server Actions)', '16.x'],
      ['UI Library', 'React', '18.3'],
      ['Language', 'TypeScript', '5.7'],
      ['Runtime', 'Node.js', '≥18.17'],
      ['Database', 'PostgreSQL', '16'],
      ['ORM', 'Prisma', '5.22'],
      ['Authentication', 'NextAuth.js v5 (JWT strategy)', '5.0-beta'],
      ['Password Hashing', 'bcryptjs', '2.4'],
      ['Styling', 'Tailwind CSS', '3.4'],
      ['Component Library', 'Radix UI (15 primitives)', '1.x'],
      ['Icons', 'lucide-react', '0.468'],
      ['Charts', 'Recharts', '2.15'],
      ['Financial Arithmetic', 'Decimal.js (20 sig. digits)', '10.4'],
      ['Excel Export', 'ExcelJS', '4.4'],
      ['PDF Export', 'jsPDF + jspdf-autotable', '4.x / 5.x'],
      ['Toast Notifications', 'Sonner', '1.7'],
      ['Date Utilities', 'date-fns', '3.6'],
      ['PWA', '@serwist/next + serwist', '9.5'],
      ['File Storage', '@vercel/blob', '2.1'],
      ['Testing', 'Vitest + @vitest/coverage-v8', '4.1'],
      ['Linting', 'ESLint + eslint-config-next', '8.x'],
    ]
  ),
  pageBreak(),
];

// ── Section 3: System Architecture ───────────────────────────────────────────
const section3 = [
  h1('3. System Architecture'),
  h2('Architecture Style'),
  body('Full-stack monolith using Next.js App Router. There is no separate API server. All data access goes through Next.js Server Actions (src/actions/). The database is accessed exclusively via Prisma ORM running in Node.js server contexts.'),
  body(''),
  h2('Request Flow'),
  code('Browser → Next.js Middleware (auth check, Edge runtime)'),
  code('        → Next.js Server Component (data fetch, no useEffect)'),
  code('        → Server Action (mutation / form submit)'),
  code('        → Prisma ORM → PostgreSQL'),
  body(''),
  h2('Authentication Flow'),
  bullet('Staff submits credentials at /login'),
  bullet('NextAuth Credentials provider verifies email + bcrypt hash against Staff table'),
  bullet('Failed attempts increment counter; ≥5 consecutive failures lock account for 30 minutes'),
  bullet('Successful login resets counter, writes audit log (LOGIN action)'),
  bullet('JWT token issued with 8-hour expiry containing: id, email, employeeId, firstName, lastName, role, roleCode, roleLevel, approvalLimit, department, departmentCode, branchId, branchName, permissions[], mustChangePassword'),
  bullet('Middleware checks JWT on every request (Edge runtime — no database access)'),
  bullet('If mustChangePassword=true, user is force-redirected to /change-password'),
  body(''),
  h2('PWA Architecture'),
  body('Service worker is generated at build time by @serwist/next. The offline fallback page is served from /~offline. A PWA install prompt component is included in the layout for desktop/mobile installation.'),
  pageBreak(),
];

// ── Section 4: Project Structure ──────────────────────────────────────────────
const section4 = [
  h1('4. Project Structure'),
  h2('Top-Level Directories'),
  makeTable(
    ['Path', 'Purpose'],
    [
      ['prisma/', 'Database schema (1,816 lines, 40+ models) and seed script'],
      ['public/', 'PWA manifest, compiled service worker, app icons'],
      ['scripts/', 'Database seeding (seed.mjs) and documentation generation'],
      ['src/actions/', '16 Next.js Server Action modules (all data mutations)'],
      ['src/app/', 'Next.js App Router — all pages and API routes (36 pages)'],
      ['src/components/', 'React components: layout shell, UI primitives, providers'],
      ['src/lib/', 'Core libraries: auth, accounting engine, audit, notifications, utils'],
      ['src/__tests__/', 'Vitest unit tests (23 tests)'],
      ['src/middleware.ts', 'Edge auth middleware — protects all non-public routes'],
      ['src/types/', 'TypeScript interfaces and NextAuth type augmentation'],
    ]
  ),
  body(''),
  h2('Server Actions (src/actions/)'),
  makeTable(
    ['File', 'Module', 'Key Operations'],
    [
      ['accounting.actions.ts', 'Accounting', 'Chart of accounts CRUD, journal entry management, period management, trial balance'],
      ['audit.actions.ts', 'Audit', 'Fetch audit logs with filtering and pagination'],
      ['auth.actions.ts', 'Auth', 'Change password, get current user'],
      ['batch.actions.ts', 'Batch', 'Bulk operations (repayments, interest accrual triggers)'],
      ['customer.actions.ts', 'Customers', 'Customer CRUD, KYC update, search'],
      ['dashboard.actions.ts', 'Dashboard', 'Role-specific dashboard metrics and charts'],
      ['document.actions.ts', 'Documents', 'Upload, list, approve, archive, version documents'],
      ['fixed-deposit.actions.ts', 'Fixed Deposits', 'Place FD, list, detail, terminate, process maturity'],
      ['hr.actions.ts', 'HR', 'Staff CRUD, attendance clock, leave request management'],
      ['loan.actions.ts', 'Loans', 'Full loan lifecycle: create, verify, approve, disburse, repay, restructure'],
      ['notification.actions.ts', 'Notifications', 'List, mark read, mark all read, get unread count'],
      ['performance.actions.ts', 'Performance', 'Create/submit/acknowledge performance reviews'],
      ['report.actions.ts', 'Reports', 'Generate and export all report types (Excel/PDF)'],
      ['savings.actions.ts', 'Savings', 'Open account, deposit, withdraw, list transactions'],
      ['staff.actions.ts', 'Staff', 'Staff management (admin), role/department lookup'],
      ['verification.actions.ts', 'Verification', 'Create tasks, assign, submit results, list reports'],
    ]
  ),
  pageBreak(),
];

// ── Section 5: Auth & Security ────────────────────────────────────────────────
const section5 = [
  h1('5. Authentication & Security'),
  h2('Authentication Provider'),
  body('NextAuth.js v5 with Credentials provider. JWT strategy (stateless). Session max age: 8 hours.'),
  body(''),
  h2('Password Security'),
  bullet('Algorithm: bcryptjs'),
  bullet('Rounds: Configurable via BCRYPT_ROUNDS environment variable (minimum 12 recommended)'),
  bullet('New staff accounts have mustChangePassword = true, forcing a password reset on first login'),
  body(''),
  h2('Brute-Force Protection'),
  bullet('Failed login attempts are counted per staff account'),
  bullet('After 5 consecutive failures, account is locked for 30 minutes'),
  bullet('Lock expiry is stored in Staff.lockedUntil field'),
  bullet('All failed attempts are written to the AuditLog table with LOGIN_FAILED action'),
  body(''),
  h2('Account Status Checks'),
  body('A staff account must be in ACTIVE status to authenticate. Accounts in INACTIVE, SUSPENDED, TERMINATED, or ON_LEAVE status will be rejected at login with an appropriate error message.'),
  body(''),
  h2('Edge Middleware'),
  body('src/middleware.ts runs on the Vercel Edge network. It validates the JWT token on every request without accessing the database. Static assets, service worker files, and /api/auth/* endpoints are excluded from protection.'),
  body(''),
  h2('Soft Delete Policy'),
  body('Staff, Customer, Loan, SavingsAccount, and Document records are soft-deleted using an isDeleted flag combined with deletedAt and deletedBy fields. This preserves complete audit trail integrity — no financial or identity data is ever permanently deleted.'),
  pageBreak(),
];

// ── Section 6: Roles & Permissions ────────────────────────────────────────────
const section6 = [
  h1('6. Roles & Permissions'),
  h2('Default Role Hierarchy'),
  makeTable(
    ['Role Code', 'Level', 'Description'],
    [
      ['SUPER_ADMIN', '100', 'Full system access, no approval limit restriction'],
      ['EXECUTIVE', '90', 'Read-only executive dashboard with portfolio KPIs'],
      ['BRANCH_MANAGER', '70', 'Branch operations management and loan approval'],
      ['LOAN_MANAGER', '60', 'Loan approval within configured financial limit'],
      ['ACCOUNTANT', '50', 'Full accounting module access'],
      ['VERIFICATION_OFFICER', '40', 'Field verification task management'],
      ['LOAN_OFFICER', '30', 'Loan creation, customer management'],
      ['TELLER', '20', 'Savings and fixed deposit transactions'],
      ['HR_OFFICER', '20', 'HR module (staff, attendance, leave, performance)'],
      ['STAFF', '10', 'Basic access: own profile, notifications'],
    ]
  ),
  body(''),
  h2('Permission Modules'),
  bullet('AUTH — Login, password change'),
  bullet('HR — Staff, attendance, leave, performance, disciplinary'),
  bullet('LOANS — Loan lifecycle (create, verify, approve, disburse, repay)'),
  bullet('SAVINGS — Account opening, deposits, withdrawals'),
  bullet('FIXED_DEPOSITS — FD placement, management, maturity'),
  bullet('ACCOUNTING — Journal entries, chart of accounts, periods'),
  bullet('CUSTOMERS — Customer CRUD, KYC'),
  bullet('DOCUMENTS — Upload, approve, archive'),
  bullet('VERIFICATION — Task assignment and completion'),
  bullet('REPORTS — Report generation and export'),
  bullet('AUDIT — View audit logs'),
  bullet('NOTIFICATIONS — View and manage notifications'),
  bullet('SETTINGS — System configuration'),
  bullet('STAFF — Staff admin operations'),
  body(''),
  h2('Permission Actions'),
  body('CREATE, READ, UPDATE, DELETE, APPROVE, REJECT, EXPORT, PRINT, REVERSAL'),
  body('Permissions are combined as MODULE:ACTION strings stored in the JWT token (e.g. LOANS:APPROVE, ACCOUNTING:REVERSAL).'),
  body(''),
  h2('Permission Gate Component'),
  code('<PermissionGate permission="LOANS:APPROVE">'),
  code('  <Button>Approve Loan</Button>'),
  code('</PermissionGate>'),
  body('Conditionally renders children based on the current user\'s permissions array from the session.'),
  pageBreak(),
];

// ── Section 7: Database Schema ────────────────────────────────────────────────
const section7 = [
  h1('7. Database Schema'),
  body('Database: PostgreSQL 16   |   ORM: Prisma 5.22   |   Schema: prisma/schema.prisma (1,816 lines)'),
  body(''),
  h2('Model Inventory'),
  makeTable(
    ['Group', 'Model', 'Description'],
    [
      ['Core System', 'SystemConfig', 'Key-value configuration store'],
      ['Core System', 'Branch', 'Physical office locations'],
      ['Core System', 'Department', 'Organisational departments'],
      ['Core System', 'Sequence', 'Auto-incrementing reference number generator'],
      ['Access Control', 'Role', 'User roles with levels and approval limits'],
      ['Access Control', 'Permission', 'Granular module:action permissions'],
      ['Access Control', 'RolePermission', 'Role ↔ Permission junction table'],
      ['Access Control', 'Staff', 'Staff accounts (authentication + HR profile)'],
      ['Access Control', 'UserSession', 'Session metadata for security audit'],
      ['HR', 'Attendance', 'Daily clock-in/clock-out records'],
      ['HR', 'PerformanceReview', 'Quarterly/annual staff performance evaluations'],
      ['HR', 'LeaveRequest', 'Leave applications with approval workflow'],
      ['HR', 'DisciplinaryAction', 'Warnings, suspensions, terminations'],
      ['Customers', 'Customer', 'Individual, corporate, and group customers'],
      ['Loans', 'LoanProduct', 'Loan product catalogue (rates, fees, limits)'],
      ['Loans', 'Loan', 'Loan applications through full lifecycle'],
      ['Loans', 'LoanVerification', 'Field verification reports per loan'],
      ['Loans', 'LoanApproval', 'Multi-level approval records'],
      ['Loans', 'LoanDisbursement', 'Disbursement details per loan'],
      ['Loans', 'LoanSchedule', 'Amortisation schedule (principal + interest)'],
      ['Loans', 'LoanRepayment', 'Individual repayment receipts'],
      ['Loans', 'LoanRestructuring', 'Loan modification records'],
      ['Savings', 'SavingsProduct', 'Savings product catalogue'],
      ['Savings', 'SavingsAccount', 'Customer savings accounts with live balances'],
      ['Savings', 'SavingsTransaction', 'All savings credits and debits'],
      ['Savings', 'WithdrawalRequest', 'Withdrawal approval workflow records'],
      ['Fixed Deposits', 'FixedDepositRate', 'Rate table by tenure and amount band'],
      ['Fixed Deposits', 'FixedDeposit', 'Fixed deposit certificates'],
      ['Fixed Deposits', 'FixedDepositInterest', 'Periodic interest payment tracking'],
      ['Verification', 'VerificationTask', 'Field visit tasks (address, employment, etc.)'],
      ['Accounting', 'ChartOfAccounts', 'Hierarchical chart of accounts'],
      ['Accounting', 'LedgerAccount', 'Customer sub-ledger accounts'],
      ['Accounting', 'JournalEntry', 'Double-entry journal headers'],
      ['Accounting', 'JournalEntryLine', 'Individual debit/credit lines'],
      ['Accounting', 'FinancialPeriod', 'Period lock/close management'],
      ['Documents', 'DocumentCategory', 'Hierarchical document categories'],
      ['Documents', 'Document', 'Document archive with version control'],
      ['Documents', 'DocumentVersion', 'Version history per document'],
      ['Audit', 'AuditLog', 'Immutable activity audit log'],
      ['Audit', 'ApprovalHistory', 'Workflow approval/rejection chain'],
      ['Audit', 'Notification', 'In-app notifications'],
    ]
  ),
  pageBreak(),
];

// ── Section 8: Application Modules ────────────────────────────────────────────
const section8 = [
  h1('8. Application Modules'),

  h2('8.1 Dashboard — /dashboard'),
  body('Role-aware dashboard. Each role sees a different combination of metrics and widgets.'),
  makeTable(
    ['Role', 'Dashboard Content'],
    [
      ['SUPER_ADMIN / BRANCH_MANAGER', 'Loans pipeline summary, savings activity, HR metrics, pending journals, audit log count, disbursement trend chart'],
      ['EXECUTIVE', 'Portfolio totals (loans/savings/FD), risk indicators (PAR%, NPL%, collection rate%), loans by category & officer charts'],
      ['LOAN_MANAGER / LOAN_OFFICER', 'Loan status board, recent loans, pending approval queue (manager only), overdue count'],
      ['VERIFICATION_OFFICER', 'My active tasks list, all pending verification count'],
      ['TELLER', 'Today\'s savings activity, pending withdrawal requests'],
      ['ACCOUNTANT', 'Pending draft journals, recent journal entries'],
      ['ALL ROLES', 'Attendance clock-in/out widget, unread notification count'],
    ]
  ),
  body(''),

  h2('8.2 Customer Management — /customers'),
  bullet('Individual, Corporate, and Group customer types'),
  bullet('BVN (Bank Verification Number) and National ID capture'),
  bullet('KYC status tracking with officer, date, and verification flag'),
  bullet('Risk rating: LOW, MEDIUM, HIGH, VERY_HIGH'),
  bullet('Next-of-kin information and emergency contacts'),
  bullet('Branch assignment and linked product activity'),
  bullet('Auto-generated customer reference numbers (e.g. CUS000001)'),
  bullet('Soft-delete preserving full audit history'),
  body(''),

  h2('8.3 Loan Management — /loans'),
  body('Full loan lifecycle from application to closure. Configurable loan products with interest type, fees, and limits.'),
  body(''),
  h3('Loan Status Flow'),
  body('DRAFT → PENDING_VERIFICATION → VERIFICATION_IN_PROGRESS → VERIFIED → PENDING_APPROVAL → APPROVED / REJECTED → PENDING_DISBURSEMENT → DISBURSED → ACTIVE → OVERDUE → DEFAULTED → CLOSED / WRITTEN_OFF'),
  body(''),
  h3('Interest Methods'),
  bullet('FLAT RATE: total interest = P × annual_rate × (tenure_months / 12). Monthly instalment = (P + total_interest) / tenure.'),
  bullet('REDUCING BALANCE (EMI): instalment = P × r × (1+r)^n / ((1+r)^n - 1), where r = monthly_rate, n = tenure_months.'),
  bullet('All calculations use Decimal.js with 20 significant digits and ROUND_HALF_UP.'),
  body(''),
  h3('Loan Restructuring'),
  body('Supports tenure change, rate change, partial write-off, and combined modifications. Previous terms are snapshotted for audit. On approval, the old repayment schedule is superseded and a new schedule is generated from the outstanding balance.'),
  body(''),

  h2('8.4 Savings Management — /savings'),
  makeTable(
    ['Savings Type', 'Description'],
    [
      ['DAILY', 'Regular daily savings, typically collected by field agents'],
      ['TARGET', 'Goal-based savings with configurable target amount and date'],
      ['FIXED', 'Fixed-term savings (distinct from Fixed Deposit certificates)'],
      ['CORPORATE', 'Business/corporate savings accounts'],
      ['JUNIOR', 'Under-18 savings accounts'],
      ['CURRENT', 'Current/transactional accounts with flexible access'],
    ]
  ),
  body(''),
  body('Every transaction stores balanceBefore and balanceAfter for line-by-line reconciliation. Withdrawal requests above a configurable threshold require approval from an authorised officer. Reversals are tracked with a reversalRef link.'),
  body(''),

  h2('8.5 Fixed Deposits — /fixed-deposits'),
  bullet('Tenure in days with interest rate lookup from the FixedDepositRate table'),
  bullet('Interest payment options: AT_MATURITY, MONTHLY, QUARTERLY'),
  bullet('Maturity instructions: ROLLOVER_PRINCIPAL_AND_INTEREST, ROLLOVER_PRINCIPAL_ONLY, PAY_OUT, TRANSFER_TO_SAVINGS'),
  bullet('Early termination with automatic penalty calculation on accrued interest'),
  bullet('Daily cron job processes matured certificates per their maturity instructions'),
  body(''),

  h2('8.6 Accounting (Double-Entry) — /accounting'),
  body('Complete double-entry bookkeeping engine. All financial transactions in the system automatically create balanced journal entries.'),
  body(''),
  h3('Double-Entry Validation Rules'),
  bullet('Total debits must exactly equal total credits (throws error if unbalanced)'),
  bullet('Entries cannot be zero-value'),
  bullet('All accounts must be active, non-header accounts'),
  bullet('The financial period must not be HARD_CLOSE'),
  bullet('Account balances are updated atomically within a Prisma transaction'),
  body(''),
  h3('Normal Balance Rules'),
  bullet('DEBIT-normal (Assets, Expenses): Debit increases, Credit decreases'),
  bullet('CREDIT-normal (Liabilities, Equity, Income): Credit increases, Debit decreases'),
  body(''),
  h3('Period Management'),
  body('OPEN → SOFT_CLOSE (adjustments allowed) → HARD_CLOSE (permanent, no entries). HARD_CLOSE cannot be reversed.'),
  body(''),

  h2('8.7 Human Resources — /hr'),
  makeTable(
    ['Sub-Module', 'Route', 'Features'],
    [
      ['Staff Directory', '/hr/staff', 'Employee list, create/edit staff, role/department assignment, status management'],
      ['Attendance', '/hr/attendance', 'Clock-in/clock-out with IP capture, daily attendance reports, absence marking'],
      ['Leave Management', '/hr/leave', 'ANNUAL, SICK, MATERNITY, PATERNITY, COMPASSIONATE, UNPAID leave types; approval workflow'],
      ['Performance Reviews', '/hr/performance', '5-dimension scoring (productivity, quality, attendance, teamwork, initiative); quarterly/annual; DRAFT → SUBMITTED → ACKNOWLEDGED'],
      ['My Profile', '/hr/my-profile', 'Self-service profile viewing and personal detail updates'],
    ]
  ),
  body(''),
  body('Disciplinary actions (WARNING, SUSPENSION, QUERY, TERMINATION) are tracked with severity levels (MINOR, MAJOR, CRITICAL) and a full response/resolution workflow.'),
  body(''),

  h2('8.8 Document Management — /documents'),
  bullet('Hierarchical document categories (unlimited depth)'),
  bullet('Version control with DocumentVersion history and file checksums'),
  bullet('Expiry date tracking for time-limited documents'),
  bullet('Confidentiality flag and access level control'),
  bullet('Linkable to Customer, Loan, or Staff record'),
  bullet('Approval workflow: DRAFT → PENDING_APPROVAL → APPROVED → ARCHIVED'),
  bullet('File storage via @vercel/blob on Vercel, or configurable local path'),
  body(''),

  h2('8.9 Verification (Field Operations) — /verification'),
  makeTable(
    ['Task Type', 'Description'],
    [
      ['ADDRESS_VERIFICATION', 'Physical visit to confirm customer or guarantor residence'],
      ['EMPLOYMENT_VERIFICATION', 'Confirm employment status and income claims'],
      ['COLLATERAL_VERIFICATION', 'Physical inspection and valuation of pledged assets'],
      ['GUARANTOR_VERIFICATION', 'Verify guarantor identity, address, and willingness'],
      ['KYC_VERIFICATION', 'Know Your Customer identity confirmation'],
      ['BUSINESS_VERIFICATION', 'Confirm business existence and operations for corporate/SME loans'],
    ]
  ),
  body(''),
  body('Tasks flow: PENDING → ASSIGNED → IN_PROGRESS → COMPLETED / FAILED / CANCELLED. Each task records GPS coordinates, verified address, visit attempt count, photos, and a structured checklist (addressVerified, employmentVerified, incomeVerified, collateralVerified).'),
  body(''),

  h2('8.10 Reports & Exports — /reports'),
  makeTable(
    ['Report', 'Formats'],
    [
      ['Loan Portfolio Report', 'Excel, PDF'],
      ['Overdue Loans Report', 'Excel, PDF'],
      ['Repayment Collection Report', 'Excel, PDF'],
      ['Customer Statements', 'PDF'],
      ['Savings Account Statements', 'PDF'],
      ['Trial Balance', 'Excel, PDF'],
      ['Income Statement', 'Excel, PDF'],
      ['Balance Sheet', 'Excel, PDF'],
    ]
  ),
  body(''),

  h2('8.11 Notifications — /notifications'),
  body('In-app notification system. Types: INFO, WARNING, ERROR, APPROVAL_REQUIRED, TASK_ASSIGNED, PAYMENT_RECEIVED, LOAN_OVERDUE, MATURITY_REMINDER. The notification-listener component polls for unread count and displays toast alerts. Bell icon in the header shows unread badge count.'),
  body(''),

  h2('8.12 Audit Logs — /audit-logs'),
  body('Immutable, append-only audit trail. Every significant action is recorded: login, logout, failed login, CRUD operations, approvals, rejections, exports, prints, reversals, and password changes. Records include userId, userEmail, userRole, action, module, entityType, entityId, description, oldValues (JSON), newValues (JSON), changedFields[], ipAddress, userAgent, sessionId, and metadata.'),
  body(''),

  h2('8.13 Settings — /settings'),
  body('SUPER_ADMIN only. Manages SystemConfig key-value pairs: company information, default interest rates, loan approval limits, working hours, holiday calendar, notification preferences, and password policy.'),
  pageBreak(),
];

// ── Section 9: API Routes ─────────────────────────────────────────────────────
const section9 = [
  h1('9. API Routes'),
  makeTable(
    ['Endpoint', 'Method', 'Description'],
    [
      ['/api/auth/[...nextauth]', 'GET, POST', 'NextAuth handlers: sign-in, sign-out, session refresh, CSRF token'],
      ['/api/cron/daily', 'POST', 'Daily automated job. Protected by CRON_SECRET Bearer token. Runs at 01:00 UTC.'],
    ]
  ),
  body(''),
  h2('Cron Job Tasks (/api/cron/daily)'),
  bullet('Mark overdue loans (past maturity date with unpaid balance)'),
  bullet('Accrue savings interest (per product frequency schedule)'),
  bullet('Accrue fixed deposit interest (daily accrual on all active FDs)'),
  bullet('Process matured fixed deposits (apply maturity instructions)'),
  bullet('Send maturity reminder notifications (configurable days in advance)'),
  bullet('Mark absent staff (no clock-in recorded by end-of-day cutoff)'),
  bullet('Reset daily counters and flags'),
  pageBreak(),
];

// ── Section 10: Deployment ────────────────────────────────────────────────────
const section10 = [
  h1('10. Deployment'),
  h2('10.1 Vercel (Recommended)'),
  bullet('Connect repository to Vercel project'),
  bullet('Set all environment variables in Vercel dashboard'),
  bullet('Provision PostgreSQL (Vercel Postgres, Neon, or Supabase)'),
  bullet('Set DATABASE_URL and DIRECT_URL to the provisioned database'),
  bullet('Run initial migration: npx prisma migrate deploy'),
  bullet('Run seed: npm run db:seed'),
  bullet('Deploy — Vercel auto-deploys on push to main branch'),
  body(''),
  body('Vercel-specific features used: Cron Jobs (vercel.json — daily at 01:00 UTC), @vercel/blob for document storage, Edge Middleware for auth.'),
  body(''),
  h2('10.2 Docker (Self-Hosted)'),
  body('The docker-compose.yml defines 4 services:'),
  makeTable(
    ['Service', 'Image/Build', 'Port', 'Purpose'],
    [
      ['postgres', 'postgres:16-alpine', '5432', 'PostgreSQL database with persistent volume'],
      ['backend', 'Dockerfile (target: backend)', '3000', 'Next.js application server'],
      ['frontend', 'Dockerfile (target: frontend)', '80', 'Nginx serving static build + reverse proxy'],
      ['migrations', 'Dockerfile (target: backend)', '—', 'One-shot prisma migrate deploy, then exits'],
    ]
  ),
  body(''),
  h3('Docker Quick Start'),
  code('cp .env.example .env'),
  code('# Edit .env with production values'),
  code('docker-compose up -d'),
  code('# After migrations complete:'),
  code('docker-compose exec backend npm run db:seed'),
  pageBreak(),
];

// ── Section 11: Environment Variables ─────────────────────────────────────────
const section11 = [
  h1('11. Environment Variables'),
  makeTable(
    ['Variable', 'Required', 'Description'],
    [
      ['DATABASE_URL', 'YES', 'PostgreSQL connection string used by Prisma'],
      ['DIRECT_URL', 'YES', 'Direct PostgreSQL URL (bypasses connection pooler for migrations)'],
      ['AUTH_SECRET', 'YES', 'NextAuth JWT signing secret — generate with: openssl rand -base64 32'],
      ['AUTH_URL', 'YES', 'App base URL (e.g. https://ems.hylink.com)'],
      ['AUTH_TRUST_HOST', 'YES', 'Set to "true" in production'],
      ['NEXTAUTH_SECRET', 'NO', 'Fallback for AUTH_SECRET (NextAuth legacy compatibility)'],
      ['NEXTAUTH_URL', 'NO', 'Fallback for AUTH_URL (NextAuth legacy compatibility)'],
      ['BCRYPT_ROUNDS', 'NO', 'Password hashing rounds (default: 12, minimum recommended: 12)'],
      ['CRON_SECRET', 'YES', 'Bearer token for /api/cron/daily endpoint authentication'],
      ['NODE_ENV', 'NO', '"development" or "production"'],
      ['BLOB_READ_WRITE_TOKEN', 'NO', 'Vercel Blob API token for document file uploads'],
    ]
  ),
  pageBreak(),
];

// ── Section 12: Database Setup ────────────────────────────────────────────────
const section12 = [
  h1('12. Database Setup & Seeding'),
  h2('NPM Commands'),
  makeTable(
    ['Command', 'Description'],
    [
      ['npm run db:generate', 'Regenerate Prisma client types from schema'],
      ['npm run db:push', 'Push schema to DB without migration history (development only)'],
      ['npm run db:migrate', 'Create and apply a new migration (development)'],
      ['npm run db:seed', 'Run the seed script (scripts/seed.mjs)'],
      ['npm run db:studio', 'Open Prisma Studio GUI at localhost:5555'],
    ]
  ),
  body(''),
  h2('Seed Data Created'),
  bullet('System sequences: LOAN, CUSTOMER, SAVINGS, FIXED_DEPOSIT, JOURNAL, RECEIPT, WITHDRAWAL, RESTRUCTURING, DOCUMENT, VERIFICATION'),
  bullet('System configuration defaults (company name, address, policy values)'),
  bullet('Default branches (Head Office)'),
  bullet('Default departments: HR, Finance, Operations, Credit, IT'),
  bullet('All default roles with permission assignments'),
  bullet('All module:action permissions (full permission matrix)'),
  bullet('Default loan products (Personal Loan, Business Loan, Emergency Loan, etc.)'),
  bullet('Default savings products (Daily Savings, Target Savings, Junior Savings, etc.)'),
  bullet('Fixed deposit rate table (rate bands by tenure and amount)'),
  bullet('Full Chart of Accounts hierarchy (Assets, Liabilities, Equity, Income, Expenses)'),
  bullet('Default document categories'),
  bullet('Super Admin account: email admin@hylink.com (mustChangePassword = true)'),
  body(''),
  body('IMPORTANT: Change the Super Admin password immediately after seeding. The mustChangePassword flag ensures this is enforced on first login.'),
  pageBreak(),
];

// ── Section 13: Testing ────────────────────────────────────────────────────────
const section13 = [
  h1('13. Testing'),
  h2('Framework'),
  body('Vitest 4.1 — compatible with TypeScript, ESM modules, and @/ path aliases. Coverage via @vitest/coverage-v8.'),
  body(''),
  h2('Commands'),
  makeTable(
    ['Command', 'Description'],
    [
      ['npm test', 'Run all tests once'],
      ['npm run test:watch', 'Watch mode — re-runs on file change'],
      ['npm run test:coverage', 'Run with code coverage report (text + lcov)'],
    ]
  ),
  body(''),
  h2('Test Suites (src/__tests__/utils.test.ts — 23 tests)'),
  makeTable(
    ['Suite', 'Tests', 'What is Verified'],
    [
      ['formatCurrency', '4', 'NGN currency formatting, zero, string input, large amounts'],
      ['formatDate / formatDateTime', '3', 'Date object and ISO string formatting'],
      ['getFinancialPeriod', '3', 'Year/month extraction including January and December'],
      ['getPeriodDateRange', '3', 'First/last day of month including leap year February'],
      ['calculateReducingBalanceSchedule', '5', 'EMI math, balance rundown to zero, schedule integrity, sequential numbering'],
      ['calculateFlatRateSchedule', '5', 'Flat interest formula, consistent monthly instalment, balance rundown to zero'],
    ]
  ),
  body(''),
  h2('Mocking Strategy'),
  body('The Prisma client is mocked at the module level in test files so pure utility functions can be tested without a live database connection. Only functions with no side effects are tested in this initial suite.'),
  pageBreak(),
];

// ── Section 14: Business Rules ─────────────────────────────────────────────────
const section14 = [
  h1('14. Key Business Rules & Financial Logic'),
  h2('Loan Creation Rules'),
  bullet('Customer must be ACTIVE status and KYC-verified'),
  bullet('Loan amount must be within the loan product\'s min/max limits'),
  bullet('Tenure must be within the product\'s min/max tenure range'),
  bullet('Customer cannot have an existing active/overdue loan without an owingBypass override'),
  bullet('Processing fee and insurance fee are calculated as a percentage of the principal'),
  body(''),
  h2('Loan Approval Rules'),
  bullet('Approver\'s role.approvalLimit must be ≥ loan principalAmount'),
  bullet('Amounts exceeding the manager\'s limit trigger REFERRED_UP to higher authority'),
  bullet('Multi-level approvals are tracked with sequential level numbers in LoanApproval'),
  body(''),
  h2('Savings Withdrawal Rules'),
  bullet('Withdrawal cannot exceed availableBalance (currentBalance minus holdAmount)'),
  bullet('Savings products may define a maxDailyWithdrawal limit'),
  bullet('Withdrawals above the threshold enter the approval queue as WithdrawalRequest'),
  bullet('Approval creates a balance hold; rejection releases the hold immediately'),
  body(''),
  h2('Fixed Deposit Rules'),
  bullet('Interest rate is determined by the FixedDepositRate table based on tenure (days) and principal amount'),
  bullet('Premature closure incurs a penalty deducted from accrued interest'),
  bullet('At maturity, the deposit is processed per the maturityInstruction field'),
  body(''),
  h2('Accounting Rules'),
  bullet('All financial transactions must create balanced journal entries (debits = credits)'),
  bullet('Entries cannot be posted to HARD_CLOSE periods'),
  bullet('Entries cannot be posted to header/parent accounts'),
  bullet('Account balances are updated atomically within a database transaction'),
  bullet('Normal balance: DEBIT (Assets, Expenses) or CREDIT (Liabilities, Equity, Income)'),
  body(''),
  h2('Sequence Reference Number Format'),
  makeTable(
    ['Sequence Code', 'Prefix', 'Pad', 'Example'],
    [
      ['LOAN', 'LN', '6 digits', 'LN000001'],
      ['CUSTOMER', 'CUS', '6 digits', 'CUS000001'],
      ['SAVINGS', 'SAV', '6 digits', 'SAV000001'],
      ['FIXED_DEPOSIT', 'FD', '6 digits', 'FD000001'],
      ['JOURNAL', 'JNL', '6 digits', 'JNL000001'],
      ['RECEIPT', 'RCP', '6 digits', 'RCP000001'],
      ['WITHDRAWAL', 'WDR', '6 digits', 'WDR000001'],
      ['RESTRUCTURING', 'RST', '6 digits', 'RST000001'],
      ['DOCUMENT', 'DOC', '6 digits', 'DOC000001'],
      ['VERIFICATION', 'VRF', '6 digits', 'VRF000001'],
    ]
  ),
  pageBreak(),
];

// ── Assemble the document ─────────────────────────────────────────────────────
const doc = new Document({
  title: 'Hylink Finance EMS — Technical & Functional Documentation',
  description: 'Full system documentation for Hylink Finance Limited Enterprise Management System v2.0.0',
  creator: 'Hylink Finance Limited',
  keywords: 'EMS, Hylink, Finance, Documentation',
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 22, color: DARK_TEXT },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, size: 32, color: BRAND_BLUE, font: 'Calibri' },
        paragraph: { spacing: { before: 400, after: 200 } },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, size: 26, color: BRAND_BLUE, font: 'Calibri' },
        paragraph: { spacing: { before: 300, after: 120 } },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        run: { bold: true, size: 24, color: BRAND_GOLD, font: 'Calibri' },
        paragraph: { spacing: { before: 200, after: 80 } },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND_GOLD } },
              children: [
                new TextRun({ text: 'Hylink Finance Limited — Enterprise Management System', size: 18, color: MID_GREY, font: 'Calibri' }),
                new TextRun({ text: '   |   v2.0.0   |   CONFIDENTIAL', size: 18, color: MID_GREY, font: 'Calibri' }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: BRAND_GOLD } },
              children: [
                new TextRun({ text: '© 2026 Hylink Finance Limited', size: 18, color: MID_GREY, font: 'Calibri' }),
                new TextRun({ text: '   |   Page ', size: 18, color: MID_GREY, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: MID_GREY, font: 'Calibri' }),
                new TextRun({ text: ' of ', size: 18, color: MID_GREY, font: 'Calibri' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: MID_GREY, font: 'Calibri' }),
              ],
            }),
          ],
        }),
      },
      children: [
        ...coverPage,
        ...section1,
        ...section2,
        ...section3,
        ...section4,
        ...section5,
        ...section6,
        ...section7,
        ...section8,
        ...section9,
        ...section10,
        ...section11,
        ...section12,
        ...section13,
        ...section14,
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(OUT_PATH, buffer);
console.log(`✓ DOCX written to: ${OUT_PATH}`);
