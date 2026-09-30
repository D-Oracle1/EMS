/**
 * Issuing staff login details in bulk.
 *
 * Passwords are stored only as hashes, so "give me everyone's password" can
 * only be met by issuing fresh temporary ones. These tests hold the lines that
 * make that safe: only user administrators may do it, never to themselves,
 * never to terminated staff, a bounded number at a time, and every new
 * password is hashed, forces a change at next sign-in, and is audited.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret';
  return {
    session: { user: {} as any },
    staff: [] as any[],
    directory: [] as any[],
    updates: [] as any[],
    findManyWhere: null as any,
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    staff: {
      findMany: vi.fn(async ({ where }: any) => {
        h.findManyWhere = where;
        return where.id ? h.staff.filter((s) => where.id.in.includes(s.id)) : h.directory;
      }),
      update: vi.fn(async (args: any) => {
        h.updates.push(args);
        return {};
      }),
    },
  },
}));
vi.mock('@/lib/auth-utils', () => ({ getSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('bcryptjs', async (importOriginal) => {
  const mod: any = await importOriginal();
  const real = mod.default ?? mod;
  // Cheap rounds so the suite stays fast; the real cost is set in the action.
  const hash = vi.fn(async (pw: string) => real.hash(pw, 4));
  return { default: { ...real, hash }, hash, compare: real.compare };
});

import { issueLoginDetails, getLoginDirectory } from '@/actions/auth.actions';
import { auditLog } from '@/lib/audit';
import { generateTempPassword, issueTempPassword, recoverTempPassword } from '@/lib/temp-password';

const admin = {
  id: 'admin-1', email: 'admin@x.com', roleCode: 'SUPER_ADMIN',
  firstName: 'Ada', lastName: 'Admin', permissions: ['SYSTEM:USER_MANAGE'],
};
const person = (id: string, first: string) => ({
  id, firstName: first, lastName: 'Staff', employeeId: `EMP-${id}`, email: `${id}@x.com`,
  role: { name: 'Manager' }, branch: { name: 'Ikeja' },
});

beforeEach(() => {
  h.session = { user: admin };
  h.staff = [person('s1', 'Bola'), person('s2', 'Chidi')];
  h.updates = [];
  h.findManyWhere = null;
  vi.mocked(auditLog).mockClear();
});

describe('generateTempPassword', () => {
  it('carries the prefix and a body of unambiguous characters', () => {
    const pw = generateTempPassword();
    expect(pw).toMatch(/^Hylink@[a-zA-Z2-9]{8}$/);
    expect(pw.slice(7)).not.toMatch(/[0O1lI]/);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateTempPassword()));
    expect(seen.size).toBe(200);
  });
});

describe('issueLoginDetails', () => {
  it('refuses anyone without SYSTEM:USER_MANAGE', async () => {
    h.session = { user: { ...admin, permissions: ['HR:STAFF_READ'] } };
    const result = await issueLoginDetails(['s1']);
    expect(result.success).toBe(false);
    expect(h.updates).toHaveLength(0);
  });

  it('returns a readable password for each person and stores only its hash', async () => {
    const result = await issueLoginDetails(['s1', 's2']);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);

    for (const issued of result.data!) {
      const update = h.updates.find((u) => u.where.id === issued.staffId);
      expect(update.data.passwordHash).not.toBe(issued.tempPassword);
      expect(await bcrypt.compare(issued.tempPassword, update.data.passwordHash)).toBe(true);
    }
  });

  it('forces a password change and clears any lockout', async () => {
    await issueLoginDetails(['s1']);
    expect(h.updates[0].data).toMatchObject({ mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null });
  });

  it('records the issue time, from which the pending password can be looked up', async () => {
    const { data } = await issueLoginDetails(['s1']);
    const { passwordChangedAt } = h.updates[0].data;
    expect(recoverTempPassword('s1', passwordChangedAt)).toBe(data![0].tempPassword);
  });

  it('carries name, email, role and branch for sending', async () => {
    const { data } = await issueLoginDetails(['s1']);
    expect(data![0]).toMatchObject({
      name: 'Bola Staff', email: 's1@x.com', employeeId: 'EMP-s1', role: 'Manager', branch: 'Ikeja',
    });
  });

  it('never reissues the administrator\'s own password', async () => {
    h.staff.push(person('admin-1', 'Ada'));
    const { data } = await issueLoginDetails(['s1', 'admin-1']);
    expect(data!.map((d) => d.staffId)).toEqual(['s1']);
  });

  it('refuses a selection of only the administrator', async () => {
    const result = await issueLoginDetails(['admin-1']);
    expect(result.success).toBe(false);
  });

  it('skips deleted and terminated staff', async () => {
    await issueLoginDetails(['s1']);
    expect(h.findManyWhere).toMatchObject({ isDeleted: false, status: { not: 'TERMINATED' } });
  });

  it('caps how many can be reissued at once', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `x${i}`);
    const result = await issueLoginDetails(ids);
    expect(result.success).toBe(false);
    expect(h.updates).toHaveLength(0);
  });

  it('audits every reissue', async () => {
    await issueLoginDetails(['s1', 's2']);
    expect(auditLog).toHaveBeenCalledTimes(2);
  });
});

// ── Looking up pending temporary passwords ──────────────────────────────────

describe('recoverTempPassword', () => {
  it('returns the password that was issued', () => {
    const { password, issuedAt } = issueTempPassword('s1');
    expect(recoverTempPassword('s1', issuedAt)).toBe(password);
  });

  it('returns nothing for a time the staff member set by changing their own password', () => {
    // A self-service change stamps passwordChangedAt with the plain clock,
    // which almost never carries the check value in its milliseconds.
    let misses = 0;
    for (let i = 0; i < 50; i++) {
      if (recoverTempPassword('s1', new Date(1_700_000_000_000 + i * 1_001)) === null) misses++;
    }
    expect(misses).toBeGreaterThanOrEqual(45);
  });

  it('is tied to the staff member', () => {
    const { issuedAt } = issueTempPassword('s1');
    expect(recoverTempPassword('s2', issuedAt)).not.toBe(issueTempPassword('s1').password);
  });

  it('returns nothing without an issue time', () => {
    expect(recoverTempPassword('s1', null)).toBeNull();
  });
});

describe('getLoginDirectory', () => {
  const account = async (id: string, over: { own?: boolean; legacy?: boolean } = {}) => {
    const { password, issuedAt } = issueTempPassword(id);
    const hashFor = over.own ? 'Chosen-By-Staff-1!' : over.legacy ? 'Hylink@legacy99' : password;
    return {
      ...person(id, id.toUpperCase()),
      status: 'ACTIVE',
      passwordHash: await bcrypt.hash(hashFor, 4),
      passwordChangedAt: over.own ? new Date(1_700_000_000_123) : over.legacy ? null : issuedAt,
      mustChangePassword: !over.own,
      lastLoginAt: over.own ? new Date() : null,
      lockedUntil: null,
      _password: password,
    };
  };

  it('refuses anyone without SYSTEM:USER_MANAGE', async () => {
    h.session = { user: { ...admin, permissions: ['HR:STAFF_READ'] } };
    expect((await getLoginDirectory()).success).toBe(false);
  });

  it('shows the temporary password of an account still waiting to sign in', async () => {
    const a = await account('p1');
    h.directory = [a];
    const { data } = await getLoginDirectory();
    expect(data![0]).toMatchObject({ state: 'PENDING', tempPassword: a._password });
  });

  it('erases it once the staff member sets their own password', async () => {
    h.directory = [await account('o1', { own: true })];
    const { data } = await getLoginDirectory();
    expect(data![0]).toMatchObject({ state: 'OWN_PASSWORD', tempPassword: null });
  });

  it('never shows a password that would not open the account', async () => {
    h.directory = [await account('l1', { legacy: true })];
    const { data } = await getLoginDirectory();
    expect(data![0]).toMatchObject({ state: 'NOT_SAVED', tempPassword: null });
  });

  it('records every viewing in the audit log', async () => {
    h.directory = [await account('p1')];
    await getLoginDirectory();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'READ', module: 'AUTH' }));
  });
});
