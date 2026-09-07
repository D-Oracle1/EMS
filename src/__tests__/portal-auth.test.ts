/**
 * Authentication: the credentials provider (staff and customer-portal paths)
 * and the OTP login provisioning that seeds a customer's first password.
 *
 * The provider's `authorize` callback is not exported, so it is captured by
 * stubbing the Credentials provider factory before importing `@/lib/auth`.
 * Password hashing runs for real (at a low cost factor) so the compare path is
 * genuinely exercised.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const h = vi.hoisted(() => {
  const state = {
    staff: null as any,
    customer: null as any,
    staffUpdates: [] as any[],
    customerUpdates: [] as any[],
    auditRows: [] as any[],
    emails: [] as any[],
    emailShouldThrow: false,
  };
  const captured = { authorize: null as any };
  return { state, captured };
});

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: (config: any) => {
    h.captured.authorize = config.authorize;
    return config;
  },
}));

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  return {
    prisma: {
      staff: {
        findUnique: vi.fn(async (args: any) =>
          state.staff && state.staff.email === args.where.email ? state.staff : null
        ),
        update: vi.fn(async (args: any) => {
          state.staffUpdates.push({ id: args.where.id, ...args.data });
          return args.data;
        }),
      },
      customer: {
        findFirst: vi.fn(async (args: any) => {
          const c = state.customer;
          if (!c) return null;
          const w = args.where ?? {};
          if (w.email && c.email !== w.email) return null;
          if (w.portalEnabled !== undefined && c.portalEnabled !== w.portalEnabled) return null;
          if (w.isDeleted !== undefined && !!c.isDeleted !== w.isDeleted) return null;
          return c;
        }),
        findUnique: vi.fn(async (args: any) =>
          state.customer && state.customer.id === args.where.id ? state.customer : null
        ),
        update: vi.fn(async (args: any) => {
          state.customerUpdates.push({ id: args.where.id, ...args.data });
          return args.data;
        }),
      },
      auditLog: {
        create: vi.fn(async (args: any) => {
          state.auditRows.push(args.data);
          return args.data;
        }),
      },
    },
    withTransaction: vi.fn(async (fn: any) => fn({})),
  };
});

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(async (params: any) => {
    if (h.state.emailShouldThrow) throw new Error('SMTP down');
    h.state.emails.push(params);
    return { ok: true };
  }),
  renderAlertEmail: vi.fn((params: any) => `<html>${params.message}</html>`),
  notifyCustomerByEmail: vi.fn(async () => undefined),
}));

import '@/lib/auth';
import { generateOtp, provisionCustomerLogin } from '@/lib/customer-auth';

const { state, captured } = h;
const authorize = (credentials: Record<string, string>) => captured.authorize(credentials, {} as any);

const PASSWORD = 'Correct-Horse-1!';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function staffRow(overrides: Record<string, any> = {}) {
  return {
    id: 'staff-1',
    email: 'ada@hylink.test',
    employeeId: 'EMP001',
    firstName: 'Ada',
    lastName: 'Obi',
    passwordHash: HASH,
    status: 'ACTIVE',
    failedLoginAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    branchId: 'branch-1',
    role: {
      name: 'Branch Manager',
      code: 'BRANCH_MANAGER',
      level: 70,
      approvalLimit: 1000000,
      permissions: [
        { permission: { code: 'LOANS:READ' } },
        { permission: { code: 'LOANS:APPROVE_L1' } },
      ],
    },
    department: { name: 'Operations', code: 'OPS' },
    branch: { name: 'HQ' },
    ...overrides,
  };
}

function customerRow(overrides: Record<string, any> = {}) {
  return {
    id: 'cust-1',
    customerNumber: 'CUS000001',
    email: 'chidi@example.test',
    firstName: 'Chidi',
    lastName: 'Eze',
    passwordHash: HASH,
    status: 'ACTIVE',
    portalEnabled: true,
    isDeleted: false,
    portalFailedAttempts: 0,
    portalLockedUntil: null,
    mustResetPassword: false,
    branchId: 'branch-1',
    ...overrides,
  };
}

beforeEach(() => {
  state.staff = null;
  state.customer = null;
  state.staffUpdates = [];
  state.customerUpdates = [];
  state.auditRows = [];
  state.emails = [];
  state.emailShouldThrow = false;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Credentials shape
// ---------------------------------------------------------------------------
describe('authorize - credential handling', () => {
  it('rejects a missing password without hitting the database', async () => {
    expect(await authorize({ email: 'ada@hylink.test', password: '' })).toBeNull();
  });

  it('rejects a missing email', async () => {
    expect(await authorize({ email: '', password: PASSWORD })).toBeNull();
  });

  it('rejects an email that matches neither a staff member nor a customer', async () => {
    expect(await authorize({ email: 'nobody@hylink.test', password: PASSWORD })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Staff login
// ---------------------------------------------------------------------------
describe('authorize - staff login', () => {
  it('returns a staff session carrying role, permissions, and approval limit', async () => {
    state.staff = staffRow();

    const user: any = await authorize({ email: 'ada@hylink.test', password: PASSWORD });

    expect(user).toMatchObject({
      id: 'staff-1',
      userType: 'staff',
      roleCode: 'BRANCH_MANAGER',
      roleLevel: 70,
      approvalLimit: 1000000,
    });
    expect(user.permissions).toEqual(['LOANS:READ', 'LOANS:APPROVE_L1']);
  });

  it('resets the failure counter and stamps the login', async () => {
    state.staff = staffRow({ failedLoginAttempts: 3 });

    await authorize({ email: 'ada@hylink.test', password: PASSWORD });

    expect(state.staffUpdates[0]).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null });
    expect(state.staffUpdates[0].lastLoginAt).toBeInstanceOf(Date);
    expect(state.auditRows[0]).toMatchObject({ action: 'LOGIN', module: 'AUTH' });
  });

  it('refuses a locked account before checking the password', async () => {
    state.staff = staffRow({ lockedUntil: new Date(Date.now() + 60_000) });

    await expect(authorize({ email: 'ada@hylink.test', password: PASSWORD })).rejects.toThrow(/locked/);
    expect(state.staffUpdates).toHaveLength(0);
  });

  it('allows login once the lock has expired', async () => {
    state.staff = staffRow({ lockedUntil: new Date(Date.now() - 60_000) });

    const user: any = await authorize({ email: 'ada@hylink.test', password: PASSWORD });

    expect(user.id).toBe('staff-1');
  });

  it('refuses a suspended account', async () => {
    state.staff = staffRow({ status: 'SUSPENDED' });

    await expect(authorize({ email: 'ada@hylink.test', password: PASSWORD })).rejects.toThrow(/not active/);
  });

  it('increments the failure counter and audits a wrong password', async () => {
    state.staff = staffRow({ failedLoginAttempts: 1 });

    const result = await authorize({ email: 'ada@hylink.test', password: 'wrong-password' });

    expect(result).toBeNull();
    expect(state.staffUpdates[0]).toMatchObject({ failedLoginAttempts: 2 });
    expect(state.staffUpdates[0].lockedUntil).toBeUndefined();
    expect(state.auditRows[0]).toMatchObject({ action: 'LOGIN_FAILED' });
  });

  it('locks the account for 30 minutes on the fifth failure', async () => {
    state.staff = staffRow({ failedLoginAttempts: 4 });

    await authorize({ email: 'ada@hylink.test', password: 'wrong-password' });

    const { failedLoginAttempts, lockedUntil } = state.staffUpdates[0];
    expect(failedLoginAttempts).toBe(5);
    const minutes = (lockedUntil.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it('carries mustChangePassword through to the session', async () => {
    state.staff = staffRow({ mustChangePassword: true });

    const user: any = await authorize({ email: 'ada@hylink.test', password: PASSWORD });

    expect(user.mustChangePassword).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Customer portal login
// ---------------------------------------------------------------------------
describe('authorize - customer portal login', () => {
  const login = () => authorize({ email: 'chidi@example.test', password: PASSWORD });

  it('returns a customer session with no staff permissions', async () => {
    state.customer = customerRow();

    const user: any = await login();

    expect(user).toMatchObject({
      id: 'cust-1',
      userType: 'customer',
      roleCode: 'CUSTOMER',
      roleLevel: 0,
      approvalLimit: 0,
      employeeId: 'CUS000001',
    });
    expect(user.permissions).toEqual([]);
  });

  it('is only reached when no staff account owns the email', async () => {
    state.staff = staffRow({ email: 'chidi@example.test' });
    state.customer = customerRow();

    const user: any = await login();

    expect(user.userType).toBe('staff');
  });

  it('refuses a customer whose portal access is switched off', async () => {
    state.customer = customerRow({ portalEnabled: false });

    expect(await login()).toBeNull();
  });

  it('refuses a soft-deleted customer', async () => {
    state.customer = customerRow({ isDeleted: true });

    expect(await login()).toBeNull();
  });

  it('refuses a customer that has no password provisioned yet', async () => {
    state.customer = customerRow({ passwordHash: null });

    expect(await login()).toBeNull();
  });

  it('refuses a locked portal account', async () => {
    state.customer = customerRow({ portalLockedUntil: new Date(Date.now() + 60_000) });

    await expect(login()).rejects.toThrow(/locked/);
  });

  it('refuses a customer that is not ACTIVE', async () => {
    state.customer = customerRow({ status: 'INACTIVE' });

    await expect(login()).rejects.toThrow(/not active/);
  });

  it('increments the portal failure counter on a wrong password', async () => {
    state.customer = customerRow({ portalFailedAttempts: 2 });

    const result = await authorize({ email: 'chidi@example.test', password: 'nope' });

    expect(result).toBeNull();
    expect(state.customerUpdates[0]).toMatchObject({ portalFailedAttempts: 3 });
    expect(state.customerUpdates[0].portalLockedUntil).toBeUndefined();
  });

  it('locks the portal account for 30 minutes on the fifth failure', async () => {
    state.customer = customerRow({ portalFailedAttempts: 4 });

    await authorize({ email: 'chidi@example.test', password: 'nope' });

    const { portalFailedAttempts, portalLockedUntil } = state.customerUpdates[0];
    expect(portalFailedAttempts).toBe(5);
    expect((portalLockedUntil.getTime() - Date.now()) / 60_000).toBeGreaterThan(29);
  });

  it('clears the lock and counter on a successful login', async () => {
    state.customer = customerRow({ portalFailedAttempts: 3, portalLockedUntil: new Date(Date.now() - 1000) });

    await login();

    expect(state.customerUpdates[0]).toMatchObject({ portalFailedAttempts: 0, portalLockedUntil: null });
    expect(state.customerUpdates[0].portalLastLoginAt).toBeInstanceOf(Date);
  });

  it('flags a first login on a temporary password as needing a reset', async () => {
    state.customer = customerRow({ mustResetPassword: true });

    const user: any = await login();

    expect(user.mustChangePassword).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// OTP generation
// ---------------------------------------------------------------------------
describe('generateOtp', () => {
  it('defaults to 8 characters and honours an explicit length', () => {
    expect(generateOtp()).toHaveLength(8);
    expect(generateOtp(12)).toHaveLength(12);
  });

  it('omits characters that are easy to misread', () => {
    // No 0/O/1/I/L - the password is read off an email and typed by hand.
    for (let i = 0; i < 50; i++) {
      expect(generateOtp(32)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
      expect(generateOtp(32)).not.toMatch(/[01IO]/);
    }
  });

  it('does not repeat itself across calls', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generateOtp()));
    expect(seen.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// provisionCustomerLogin
// ---------------------------------------------------------------------------
describe('provisionCustomerLogin', () => {
  it('enables the portal, forces a reset, and emails the temporary password', async () => {
    state.customer = customerRow({ passwordHash: null });

    await provisionCustomerLogin('cust-1');

    const update = state.customerUpdates[0];
    expect(update).toMatchObject({ portalEnabled: true, mustResetPassword: true });
    expect(update.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(state.emails[0].to).toBe('chidi@example.test');
  });

  it('emails a password that actually unlocks the account', async () => {
    state.customer = customerRow({ passwordHash: null });

    await provisionCustomerLogin('cust-1');

    // The temporary password is only ever shown in the email body.
    const otp = state.emails[0].text.match(/Temporary password: ([A-Z2-9]+)/)[1];
    expect(bcrypt.compareSync(otp, state.customerUpdates[0].passwordHash)).toBe(true);
  });

  it('is idempotent - a customer who already has a password is untouched', async () => {
    state.customer = customerRow();

    await provisionCustomerLogin('cust-1');

    expect(state.customerUpdates).toHaveLength(0);
    expect(state.emails).toHaveLength(0);
  });

  it('skips a customer with no email address', async () => {
    state.customer = customerRow({ email: null, passwordHash: null });

    await provisionCustomerLogin('cust-1');

    expect(state.customerUpdates).toHaveLength(0);
  });

  it('skips a soft-deleted customer', async () => {
    state.customer = customerRow({ isDeleted: true, passwordHash: null });

    await provisionCustomerLogin('cust-1');

    expect(state.customerUpdates).toHaveLength(0);
  });

  it('never throws when the mail provider fails - it is best effort', async () => {
    state.customer = customerRow({ passwordHash: null });
    state.emailShouldThrow = true;

    await expect(provisionCustomerLogin('cust-1')).resolves.toBeUndefined();
  });
});
