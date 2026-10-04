/**
 * Creating staff in bulk and from the onboarding form.
 *
 * The lines this file holds:
 *  - A spreadsheet is read loosely (headers in any order or case, quoted
 *    cells, Excel dates) but checked strictly: names, a valid email new to the
 *    system and to the file, a department and role that exist.
 *  - An onboarding form always keeps the staff fields, typed as they must be,
 *    and never asks the respondent for a role.
 *  - Approving needs HR:STAFF_CREATE, claims the request first so it cannot
 *    make two accounts, puts it back if creation fails, and emails the login.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'hr-1', permissions: ['HR:STAFF_CREATE'] } as any,
  claimCount: 1,
  createFails: false,
  created: [] as any[],
  emailed: [] as any[],
  updates: [] as any[],
  takenEmails: [] as string[],
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    role: { findMany: vi.fn(async () => [{ id: 'role-lo', name: 'Loan Officer', code: 'LO' }]) },
    branch: { findMany: vi.fn(async () => [{ id: 'br-ikeja', name: 'Ikeja', code: 'IKJ' }]) },
    department: { findMany: vi.fn(async () => [{ id: 'dep-loans', name: 'Loans', code: 'LOANS' }]) },
    staff: { findMany: vi.fn(async () => h.takenEmails.map((email) => ({ email }))) },
    formResponse: {
      updateMany: vi.fn(async (args: any) => { h.updates.push({ kind: 'claim', ...args }); return { count: h.claimCount }; }),
      update: vi.fn(async (args: any) => { h.updates.push({ kind: 'update', ...args }); return {}; }),
    },
  },
}));
vi.mock('@/lib/auth-utils', () => ({
  requirePermission: vi.fn(async (code: string) => {
    if (!h.user.permissions.includes(code)) throw new Error('Permission denied');
    return h.user;
  }),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/staff-create', () => ({
  createStaffRecord: vi.fn(async (input: any) => {
    if (h.createFails) throw new Error('jo@x.com is already in use by another staff member');
    h.created.push(input);
    return { staffId: `staff-${h.created.length}`, employeeId: `EMP00${h.created.length}`, tempPassword: 'TEMP-PASS' };
  }),
  emailStaffLogin: vi.fn(async (p: any) => { h.emailed.push(p); return true; }),
}));

import { approveOnboarding, rejectOnboarding } from '@/actions/onboarding.actions';
import { commitStaffImport } from '@/actions/staff-import.actions';
import {
  parseCsv, sheetToRows, resolveImportRows, matchByName, toIsoDate, toGender, staffInputProblems,
} from '@/lib/staff-input';
import {
  enforceOnboardingFields, onboardingDetails, onboardingTemplate, ONBOARDING_FIELDS, normalizeQuestions,
} from '@/lib/forms';

beforeEach(() => {
  h.user = { id: 'hr-1', permissions: ['HR:STAFF_CREATE'] };
  h.claimCount = 1;
  h.createFails = false;
  h.created = [];
  h.emailed = [];
  h.updates = [];
  h.takenEmails = [];
});

const lists = {
  departments: [{ id: 'dep-loans', name: 'Loans', code: 'LOANS' }, { id: 'dep-hr', name: 'Human Resources', code: 'HR' }],
  roles: [{ id: 'role-lo', name: 'Loan Officer', code: 'LO' }],
  branches: [{ id: 'br-ikeja', name: 'Ikeja', code: 'IKJ' }],
};

describe('reading a spreadsheet', () => {
  it('parses quoted cells, doubled quotes, commas and line breaks', () => {
    const csv = '﻿First Name*,Address\r\n"Ada","12 Allen Ave, Ikeja"\r\n"Tunde","He said ""hi""\nthen left"\r\n';
    expect(parseCsv(csv)).toEqual([
      ['First Name*', 'Address'],
      ['Ada', '12 Allen Ave, Ikeja'],
      ['Tunde', 'He said "hi"\nthen left'],
    ]);
  });

  it('matches headers loosely and names missing required columns', () => {
    const { rows, missing } = sheetToRows([['EMAIL', 'first name', 'Last Name*', 'Date of Birth (YYYY-MM-DD)'], ['a@b.co', 'Ada', 'Obi', '1990-02-01']]);
    expect(rows).toEqual([{ email: 'a@b.co', firstName: 'Ada', lastName: 'Obi', dateOfBirth: '1990-02-01' }]);
    expect(missing).toEqual(['Department', 'Role']);
  });

  it('finds records by name or code, ignoring case and punctuation', () => {
    expect(matchByName('human-resources', lists.departments)?.id).toBe('dep-hr');
    expect(matchByName('lo', lists.roles)?.id).toBe('role-lo');
    expect(matchByName('Lagos', lists.branches)).toBeUndefined();
  });

  it('reads dates the Nigerian way round and genders loosely', () => {
    expect(toIsoDate('5/3/1990')).toBe('1990-03-05');
    expect(toIsoDate('1990-03-05T00:00:00.000Z')).toBe('1990-03-05');
    expect(toGender('f')).toBe('FEMALE');
    expect(toGender('Male')).toBe('MALE');
    expect(toGender('unknown')).toBeUndefined();
  });
});

describe('checking rows', () => {
  const good = { firstName: 'Ada', lastName: 'Obi', email: 'ADA@x.com', department: 'loans', role: 'Loan Officer', branch: 'Ikeja', gender: 'F' };

  it('resolves a good row to ids', () => {
    const [r] = resolveImportRows([good], lists, new Set());
    expect(r.problems).toEqual([]);
    expect(r.input).toMatchObject({ email: 'ada@x.com', departmentId: 'dep-loans', roleId: 'role-lo', branchId: 'br-ikeja', gender: 'FEMALE' });
    expect(r.line).toBe(2);
  });

  it('names every problem: unknown names, bad email, taken and repeated emails', () => {
    const rows = resolveImportRows(
      [
        { ...good, department: 'Treasury', role: 'Wizard' },
        { firstName: 'Bo', email: 'not-an-email', department: 'Loans', role: 'LO' },
        { ...good, email: 'taken@x.com' },
        { ...good },
      ],
      lists,
      new Set(['taken@x.com'])
    );
    expect(rows[0].problems).toEqual(['No department called "Treasury"', 'No role called "Wizard"']);
    expect(rows[1].problems).toEqual(['Last name is missing', '"not-an-email" is not a valid email']);
    expect(rows[2].problems).toEqual(['taken@x.com already belongs to a staff member']);
    expect(rows[3].problems).toEqual(['Same email as row 2']);
    expect(rows.every((r) => r.input === null)).toBe(true);
  });

  it('refuses a birthday in the future', () => {
    expect(staffInputProblems({ firstName: 'a', lastName: 'b', email: 'a@b.co', departmentId: 'd', roleId: 'r', dateOfBirth: '2999-01-01' }))
      .toEqual(['Date of birth is in the future']);
  });
});

describe('commitStaffImport', () => {
  const rows = [
    { firstName: 'Ada', lastName: 'Obi', email: 'ada@x.com', department: 'Loans', role: 'Loan Officer' },
    { firstName: 'Bad', lastName: 'Row', email: 'bad@x.com', department: 'Nowhere', role: 'Loan Officer' },
  ];

  it('creates the ready rows, skips the rest and emails logins', async () => {
    const result = await commitStaffImport(rows, { sendEmails: true });
    expect(result.success).toBe(true);
    expect(result.data!.created).toHaveLength(1);
    expect(result.data!.created[0]).toMatchObject({ employeeId: 'EMP001', tempPassword: 'TEMP-PASS', role: 'Loan Officer', emailed: true });
    expect(result.data!.skipped).toEqual([{ line: 3, name: 'Bad Row', problems: ['No department called "Nowhere"'] }]);
    expect(h.emailed).toHaveLength(1);
  });

  it('needs HR:STAFF_CREATE', async () => {
    h.user = { id: 'x', permissions: ['HR:STAFF_READ'] };
    expect((await commitStaffImport(rows, { sendEmails: true })).success).toBe(false);
    expect(h.created).toHaveLength(0);
  });

  it('refuses an empty or oversized file', async () => {
    expect((await commitStaffImport([], { sendEmails: false })).error).toMatch(/no staff rows/);
    expect((await commitStaffImport(Array(101).fill(rows[0]), { sendEmails: false })).error).toMatch(/at most 100/);
  });
});

describe('the onboarding form', () => {
  it('starts with every staff field and no role question', () => {
    const qs = onboardingTemplate();
    for (const f of ONBOARDING_FIELDS) expect(qs.some((q) => q.id === f.id)).toBe(true);
    expect(qs.some((q) => /role|department/i.test(q.id))).toBe(false);
  });

  it('puts back removed fields, restores types and keeps the essentials required', () => {
    const edited = normalizeQuestions([
      { id: 'firstName', type: 'PARAGRAPH', label: 'Your first name', required: false },
      { id: 'q_extra', type: 'SHORT_TEXT', label: 'Shirt size' },
    ]);
    const fixed = enforceOnboardingFields(edited);
    const first = fixed.find((q) => q.id === 'firstName')!;
    expect(first).toMatchObject({ type: 'SHORT_TEXT', label: 'Your first name', required: true });
    expect(fixed.find((q) => q.id === 'email')).toMatchObject({ type: 'EMAIL', required: true });
    expect(fixed.some((q) => q.id === 'q_extra')).toBe(true);
    expect(fixed).toHaveLength(ONBOARDING_FIELDS.length + 1);
  });

  it('reads a response into staff details', () => {
    expect(onboardingDetails({ firstName: ' Ada ', lastName: 'Obi', email: 'ADA@X.COM', gender: 'Female', phone: '' })).toEqual({
      firstName: 'Ada', middleName: undefined, lastName: 'Obi', email: 'ada@x.com', phone: undefined,
      dateOfBirth: undefined, gender: 'FEMALE', address: undefined, nationalId: undefined,
    });
  });
});

describe('approving onboarding requests', () => {
  const item = {
    responseId: 'resp-1',
    details: { firstName: 'Jo', lastName: 'Ade', email: 'jo@x.com' },
    departmentId: 'dep-loans', roleId: 'role-lo', branchId: 'br-ikeja',
  };

  it('claims the request, creates the staff member, links it and emails the login', async () => {
    const result = await approveOnboarding([item], { sendEmails: true });
    expect(result.data!.created).toEqual([
      expect.objectContaining({ responseId: 'resp-1', employeeId: 'EMP001', role: 'Loan Officer', branch: 'Ikeja', emailed: true }),
    ]);
    expect(h.updates[0]).toMatchObject({ kind: 'claim', where: { id: 'resp-1', onboardingStatus: 'PENDING' } });
    expect(h.updates[1]).toMatchObject({ kind: 'update', data: { onboardedStaffId: 'staff-1' } });
    expect(h.created[0]).toMatchObject({ departmentId: 'dep-loans', roleId: 'role-lo' });
  });

  it('will not create twice when someone else got there first', async () => {
    h.claimCount = 0;
    const result = await approveOnboarding([item], { sendEmails: true });
    expect(result.data!.failed[0].error).toMatch(/Already approved/);
    expect(h.created).toHaveLength(0);
  });

  it('puts the request back when creation fails', async () => {
    h.createFails = true;
    const result = await approveOnboarding([item], { sendEmails: true });
    expect(result.data!.failed[0].error).toMatch(/already in use/);
    expect(h.updates.at(-1)).toMatchObject({ kind: 'update', data: { onboardingStatus: 'PENDING' } });
  });

  it('refuses without a role, and without HR:STAFF_CREATE', async () => {
    const noRole = await approveOnboarding([{ ...item, roleId: '' }], { sendEmails: true });
    expect(noRole.data!.failed[0].error).toMatch(/Role is missing/);
    expect(h.updates).toHaveLength(0);
    h.user = { id: 'x', permissions: [] };
    expect((await approveOnboarding([item], { sendEmails: true })).success).toBe(false);
    expect((await rejectOnboarding(['resp-1'])).success).toBe(false);
  });
});
