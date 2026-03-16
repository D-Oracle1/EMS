/**
 * seed-test-accounts.mjs
 * Creates one ready-to-use staff account for every role in the system.
 * mustChangePassword = false so all accounts can be used immediately.
 *
 * Run: node scripts/seed-test-accounts.mjs
 *
 * Prerequisites:
 *   1. .env file present with DIRECT_URL set
 *   2. npx prisma generate already run (or npm run db:generate)
 *   3. Database migrated and base seed run (npm run db:seed)
 */

import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');
const envPath   = resolve(root, '.env');

// ── Load .env ─────────────────────────────────────────────────────────────────
if (!existsSync(envPath)) {
  console.error('ERROR: .env file not found at', envPath);
  process.exit(1);
}

const envContent = readFileSync(envPath, 'utf8');
function getEnv(key) {
  const m = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

const dbUrl = getEnv('DIRECT_URL') || getEnv('DATABASE_URL');
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL / DIRECT_URL not found in .env');
  process.exit(1);
}
process.env.DATABASE_URL = dbUrl;

// ── Dynamic import after env is set ──────────────────────────────────────────
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { hashSync }     = require('bcryptjs');

const prisma = new PrismaClient();

// ── Test account definitions ──────────────────────────────────────────────────
// Password for all test accounts (except Super Admin which keeps its own)
const TEST_PASSWORD = 'Test@1234';
const ROUNDS        = 12;

const TEST_ACCOUNTS = [
  // ── Super Admin (update only — preserve existing credentials) ──────────────
  {
    employeeId:  'EMP00001',
    email:       'admin@hylinkfinance.com',
    firstName:   'System',
    lastName:    'Administrator',
    phone:       '+2340000000000',
    password:    'Admin@2024',         // Kept distinct — production-style account
    roleCode:    'SUPER_ADMIN',
    deptCode:    'ADMIN',
    mustChange:  true,
    note:        '⚠  mustChangePassword=true — change on first login',
  },

  // ── Director (level 90) ────────────────────────────────────────────────────
  {
    employeeId:  'EMP00002',
    email:       'director@hylinkfinance.com',
    firstName:   'Adaeze',
    lastName:    'Okonkwo',
    phone:       '+2348100000002',
    password:    TEST_PASSWORD,
    roleCode:    'DIRECTOR',
    deptCode:    'MANAGEMENT',
    mustChange:  false,
  },

  // ── HR Administrator (level 80) ────────────────────────────────────────────
  {
    employeeId:  'EMP00003',
    email:       'hr.admin@hylinkfinance.com',
    firstName:   'Chukwuemeka',
    lastName:    'Nwosu',
    phone:       '+2348100000003',
    password:    TEST_PASSWORD,
    roleCode:    'HR_ADMIN',
    deptCode:    'HR',
    mustChange:  false,
  },

  // ── Manager (level 70) ────────────────────────────────────────────────────
  {
    employeeId:  'EMP00004',
    email:       'manager@hylinkfinance.com',
    firstName:   'Babatunde',
    lastName:    'Adeleke',
    phone:       '+2348100000004',
    password:    TEST_PASSWORD,
    roleCode:    'MANAGER',
    deptCode:    'MANAGEMENT',
    mustChange:  false,
  },

  // ── Account Officer (level 60) ────────────────────────────────────────────
  {
    employeeId:  'EMP00005',
    email:       'accounts@hylinkfinance.com',
    firstName:   'Ngozi',
    lastName:    'Eze',
    phone:       '+2348100000005',
    password:    TEST_PASSWORD,
    roleCode:    'ACCOUNT_OFFICER',
    deptCode:    'ACCOUNTS',
    mustChange:  false,
  },

  // ── Loan Officer (level 50) ───────────────────────────────────────────────
  {
    employeeId:  'EMP00006',
    email:       'loan.officer@hylinkfinance.com',
    firstName:   'Emeka',
    lastName:    'Obi',
    phone:       '+2348100000006',
    password:    TEST_PASSWORD,
    roleCode:    'LOAN_OFFICER',
    deptCode:    'LOANS',
    mustChange:  false,
  },

  // ── Verification Officer (level 45) ──────────────────────────────────────
  {
    employeeId:  'EMP00007',
    email:       'verification@hylinkfinance.com',
    firstName:   'Seun',
    lastName:    'Adeyemi',
    phone:       '+2348100000007',
    password:    TEST_PASSWORD,
    roleCode:    'VERIFICATION_OFFICER',
    deptCode:    'VERIFICATION',
    mustChange:  false,
  },

  // ── Savings Officer (level 40) ────────────────────────────────────────────
  {
    employeeId:  'EMP00008',
    email:       'savings@hylinkfinance.com',
    firstName:   'Amaka',
    lastName:    'Obiora',
    phone:       '+2348100000008',
    password:    TEST_PASSWORD,
    roleCode:    'SAVINGS_OFFICER',
    deptCode:    'SAVINGS',
    mustChange:  false,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║   Hylink EMS — Test Account Seeder                  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // Fetch branch HQ
  const branch = await prisma.branch.findUnique({ where: { code: 'HQ' } });
  if (!branch) {
    console.error('ERROR: Branch HQ not found. Run the main seed first: npm run db:seed');
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const acct of TEST_ACCOUNTS) {
    // Resolve role
    const role = await prisma.role.findUnique({ where: { code: acct.roleCode } });
    if (!role) {
      console.warn(`  ⚠  Role ${acct.roleCode} not found — skipping ${acct.email}`);
      skipped++;
      continue;
    }

    // Resolve department
    const dept = await prisma.department.findUnique({ where: { code: acct.deptCode } });
    if (!dept) {
      console.warn(`  ⚠  Department ${acct.deptCode} not found — skipping ${acct.email}`);
      skipped++;
      continue;
    }

    const passwordHash = hashSync(acct.password, ROUNDS);

    const staff = await prisma.staff.upsert({
      where: { email: acct.email },
      update: {
        // On re-run: refresh role, department and password only (don't clobber other fields)
        roleId:              role.id,
        departmentId:        dept.id,
        passwordHash,
        mustChangePassword:  acct.mustChange,
        status:              'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil:         null,
      },
      create: {
        employeeId:          acct.employeeId,
        email:               acct.email,
        firstName:           acct.firstName,
        lastName:            acct.lastName,
        phone:               acct.phone,
        passwordHash,
        roleId:              role.id,
        departmentId:        dept.id,
        branchId:            branch.id,
        status:              'ACTIVE',
        mustChangePassword:  acct.mustChange,
        failedLoginAttempts: 0,
      },
    });

    const action = staff.createdAt.getTime() === staff.updatedAt.getTime() ? 'created' : 'updated';
    const note   = acct.note ? `  ${acct.note}` : '';
    console.log(
      `  ✓  [${acct.roleCode.padEnd(22)}]  ${acct.email.padEnd(38)}  ${action}${note}`
    );
    created++;
  }

  // ── Summary table ───────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────────');
  console.log('  ROLE                    EMAIL                              PASSWORD');
  console.log('──────────────────────────────────────────────────────────────────');
  for (const a of TEST_ACCOUNTS) {
    console.log(
      `  ${a.roleCode.padEnd(22)}  ${a.email.padEnd(38)} ${a.password}`
    );
  }
  console.log('──────────────────────────────────────────────────────────────────');
  console.log(`\n  ${created} account(s) upserted, ${skipped} skipped.`);
  console.log('  All accounts are ACTIVE and ready to use.\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
