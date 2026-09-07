/**
 * Route gating and password changes.
 *
 * The `authorized` callback in `auth.config.ts` is the only thing keeping
 * customers out of the staff dashboard (and staff out of the portal), and it
 * also enforces the forced password reset that every provisioned account
 * starts with. `changePassword` is the other half of that flow.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/lib/auth.config';

const h = vi.hoisted(() => {
  const state = {
    sessionUser: null as any,
    staff: null as any,
    customer: null as any,
    staffUpdates: [] as any[],
    customerUpdates: [] as any[],
    audits: [] as any[],
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  return {
    prisma: {
      staff: {
        findUnique: vi.fn(async () => state.staff),
        update: vi.fn(async (args: any) => {
          state.staffUpdates.push({ id: args.where.id, ...args.data });
          return args.data;
        }),
      },
      customer: {
        findUnique: vi.fn(async () => state.customer),
        update: vi.fn(async (args: any) => {
          state.customerUpdates.push({ id: args.where.id, ...args.data });
          return args.data;
        }),
      },
    },
    withTransaction: vi.fn(async (fn: any) => fn({})),
  };
});

vi.mock('@/lib/auth-utils', () => ({
  getSession: vi.fn(async () => ({ user: h.state.sessionUser })),
  requirePermission: vi.fn(async () => h.state.sessionUser),
  requireAnyPermission: vi.fn(async () => h.state.sessionUser),
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(async (entry: any) => {
    h.state.audits.push(entry);
  }),
}));

import { changePassword } from '@/actions/auth.actions';

const { state } = h;

// ---------------------------------------------------------------------------
// Route gating
// ---------------------------------------------------------------------------
const authorized = (user: Record<string, unknown> | null, path: string) =>
  (authConfig.callbacks as any).authorized({
    auth: user ? { user } : null,
    request: { nextUrl: new URL(`http://localhost:3000${path}`) },
  });

const staff = { id: 'staff-1', userType: 'staff', mustChangePassword: false };
const customer = { id: 'cust-1', userType: 'customer', mustChangePassword: false };

/** Redirect target of an authorized() result, or null if it was a boolean. */
const redirectTo = (result: any) =>
  result instanceof Response ? new URL(result.headers.get('location')!).pathname : null;

describe('authorized - anonymous visitors', () => {
  it('always lets the auth API through', () => {
    expect(authorized(null, '/api/auth/session')).toBe(true);
  });

  it('lets an anonymous visitor reach the login page', () => {
    expect(authorized(null, '/login')).toBe(true);
  });

  it('blocks an anonymous visitor from the dashboard', () => {
    expect(authorized(null, '/dashboard')).toBe(false);
  });

  it('blocks an anonymous visitor from the portal', () => {
    expect(authorized(null, '/portal')).toBe(false);
  });
});

describe('authorized - signed-in redirects away from /login', () => {
  it('sends staff to the dashboard', () => {
    expect(redirectTo(authorized(staff, '/login'))).toBe('/dashboard');
  });

  it('sends a customer to the portal', () => {
    expect(redirectTo(authorized(customer, '/login'))).toBe('/portal');
  });
});

describe('authorized - forced password reset', () => {
  it('diverts staff to the change-password page from anywhere', () => {
    expect(redirectTo(authorized({ ...staff, mustChangePassword: true }, '/dashboard'))).toBe('/change-password');
    expect(redirectTo(authorized({ ...staff, mustChangePassword: true }, '/loans'))).toBe('/change-password');
  });

  it('diverts a customer on a temporary password to the change-password page', () => {
    expect(redirectTo(authorized({ ...customer, mustChangePassword: true }, '/portal'))).toBe('/change-password');
  });

  it('does not divert once the user is already on that page', () => {
    expect(authorized({ ...staff, mustChangePassword: true }, '/change-password')).toBe(true);
    expect(authorized({ ...customer, mustChangePassword: true }, '/change-password')).toBe(true);
  });
});

describe('authorized - staff and customer separation', () => {
  it('keeps a customer out of the staff dashboard', () => {
    expect(redirectTo(authorized(customer, '/dashboard'))).toBe('/portal');
  });

  it('keeps a customer out of every staff module', () => {
    for (const path of ['/loans', '/savings', '/customers/cust-2', '/accounting/journal', '/audit-logs']) {
      expect(redirectTo(authorized(customer, path))).toBe('/portal');
    }
  });

  it('lets a customer use the portal', () => {
    expect(authorized(customer, '/portal')).toBe(true);
  });

  it('keeps staff out of the portal', () => {
    expect(redirectTo(authorized(staff, '/portal'))).toBe('/dashboard');
  });

  it('lets staff use the dashboard', () => {
    expect(authorized(staff, '/dashboard')).toBe(true);
  });

  it('treats a session with no userType as staff', () => {
    expect(authorized({ id: 'staff-2' }, '/dashboard')).toBe(true);
    expect(redirectTo(authorized({ id: 'staff-2' }, '/portal'))).toBe('/dashboard');
  });
});

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------
const CURRENT = 'Current-Pass-1!';
const CURRENT_HASH = bcrypt.hashSync(CURRENT, 4);
const STRONG = 'Brand-New-Pass-9!';

beforeEach(() => {
  state.sessionUser = { id: 'staff-1', userType: 'staff', email: 'ada@hylink.test', firstName: 'Ada', lastName: 'Obi', roleCode: 'BRANCH_MANAGER' };
  state.staff = { passwordHash: CURRENT_HASH };
  state.customer = { passwordHash: CURRENT_HASH };
  state.staffUpdates = [];
  state.customerUpdates = [];
  state.audits = [];
  vi.clearAllMocks();
});

describe('changePassword - staff', () => {
  it('rejects a wrong current password', async () => {
    const result = await changePassword('not-my-password', STRONG);

    expect(result).toMatchObject({ success: false, error: 'Current password is incorrect' });
    expect(state.staffUpdates).toHaveLength(0);
  });

  it('rejects a missing user record', async () => {
    state.staff = null;

    expect(await changePassword(CURRENT, STRONG)).toMatchObject({ success: false, error: 'User not found' });
  });

  it.each([
    ['Ab1!xyz', /at least 8 characters/],
    ['alllower1!', /uppercase letter/],
    ['ALLUPPER1!', /lowercase letter/],
    ['NoDigitsHere!', /contain a number/],
    ['NoSpecial123', /special character/],
  ])('rejects %s', async (candidate, expected) => {
    const result = await changePassword(CURRENT, candidate);

    expect(result.error).toMatch(expected);
    expect(state.staffUpdates).toHaveLength(0);
  });

  it('rejects reusing the current password', async () => {
    const result = await changePassword(CURRENT, CURRENT);

    expect(result.error).toMatch(/must be different/);
  });

  it('stores a new hash, clears the reset flag, and audits the change', async () => {
    const result = await changePassword(CURRENT, STRONG);

    expect(result.success).toBe(true);
    const update = state.staffUpdates[0];
    expect(update.mustChangePassword).toBe(false);
    expect(update.passwordChangedAt).toBeInstanceOf(Date);
    expect(update.passwordHash).not.toBe(CURRENT_HASH);
    expect(bcrypt.compareSync(STRONG, update.passwordHash)).toBe(true);
    expect(state.audits[0]).toMatchObject({ action: 'PASSWORD_CHANGE', module: 'AUTH', entityType: 'STAFF' });
  });
});

describe('changePassword - customer portal', () => {
  beforeEach(() => {
    state.sessionUser = { id: 'cust-1', userType: 'customer', email: 'chidi@example.test', firstName: 'Chidi', lastName: 'Eze' };
  });

  it('rejects a wrong temporary password', async () => {
    const result = await changePassword('wrong-otp', STRONG);

    expect(result).toMatchObject({ success: false, error: 'Current password is incorrect' });
    expect(state.customerUpdates).toHaveLength(0);
  });

  it('applies the same complexity rules as staff', async () => {
    expect((await changePassword(CURRENT, 'weak')).error).toMatch(/at least 8 characters/);
    expect((await changePassword(CURRENT, 'nouppercase1!')).error).toMatch(/uppercase letter/);
  });

  it('rejects keeping the temporary password', async () => {
    expect((await changePassword(CURRENT, CURRENT)).error).toMatch(/must be different/);
  });

  it('clears mustResetPassword so the portal stops forcing a reset', async () => {
    const result = await changePassword(CURRENT, STRONG);

    expect(result.success).toBe(true);
    expect(state.customerUpdates[0]).toMatchObject({ id: 'cust-1', mustResetPassword: false });
    expect(bcrypt.compareSync(STRONG, state.customerUpdates[0].passwordHash)).toBe(true);
  });

  it('never touches the staff table on the customer path', async () => {
    await changePassword(CURRENT, STRONG);

    expect(state.staffUpdates).toHaveLength(0);
    expect(state.audits[0]).toMatchObject({ userRole: 'CUSTOMER', entityType: 'CUSTOMER' });
  });

  it('rejects a customer that has no password provisioned', async () => {
    state.customer = { passwordHash: null };

    expect(await changePassword(CURRENT, STRONG)).toMatchObject({ success: false, error: 'User not found' });
  });
});
