/**
 * Branch scoping.
 *
 * The rule this file defends: staff posted to a branch see only that branch's
 * customers and money. Senior roles (level 80+: HR, GM, Director, Super Admin)
 * see every branch. Junior head-office staff (IT, accounts) see no branch.
 * HR administrators see every branch's people.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  branchOf: {} as Record<string, string | null>,
  customerBranch: {} as Record<string, string | null>,
  branches: [] as { id: string; code: string }[],
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    staff: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id in h.branchOf ? { branchId: h.branchOf[where.id] } : null
      ),
    },
    customer: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id in h.customerBranch ? { branchId: h.customerBranch[where.id] } : null
      ),
    },
    branch: { findMany: vi.fn(async () => h.branches) },
  },
}));

import {
  seesAllBranches, branchScopeFor, staffScopeFor, inScope, ALL_BRANCHES_ROLE_LEVEL, NO_BRANCH,
  canOpenBranchesConsole, branchForNewRecord,
} from '@/lib/branch-scope';

const viewer = (id: string, overrides: Partial<{ permissions: string[]; roleLevel: number }> = {}) => ({
  id,
  permissions: [] as string[],
  roleLevel: 70,
  ...overrides,
});

beforeEach(() => {
  h.branchOf = { manager: 'branch-a', officer: 'branch-b', hq: null, hr: 'branch-a' };
  h.customerBranch = { 'cust-a': 'branch-a', 'cust-none': null };
  h.branches = [{ id: 'branch-a', code: 'IKJ' }, { id: 'branch-hq', code: 'HQ' }];
});

describe('seesAllBranches', () => {
  it('lets the superuser see every branch', () => {
    expect(seesAllBranches(viewer('x', { permissions: ['ADMIN:SYSTEM'], roleLevel: 10 }))).toBe(true);
  });

  it('lets senior roles see every branch: HR (80), GM (80+), Director (90)', () => {
    expect(ALL_BRANCHES_ROLE_LEVEL).toBe(80);
    for (const roleLevel of [80, 85, 90, 100]) {
      expect(seesAllBranches(viewer('x', { roleLevel }))).toBe(true);
    }
  });

  it('confines a manager', () => {
    expect(seesAllBranches(viewer('x', { roleLevel: 70 }))).toBe(false);
  });

  it('does not treat SYSTEM:CONFIG_MANAGE (IT) as cross-branch', () => {
    expect(seesAllBranches(viewer('x', { permissions: ['SYSTEM:CONFIG_MANAGE'], roleLevel: 55 }))).toBe(false);
  });
});

describe('branchScopeFor', () => {
  it('confines branch staff to their own branch', async () => {
    expect(await branchScopeFor(viewer('manager'))).toBe('branch-a');
    expect(await branchScopeFor(viewer('officer', { roleLevel: 40 }))).toBe('branch-b');
  });

  it('gives junior head-office staff (no branch) no branch at all', async () => {
    const scope = await branchScopeFor(viewer('hq', { roleLevel: 55 }));
    expect(scope).toBe(NO_BRANCH);
    expect(inScope(scope, 'branch-a')).toBe(false);
    expect(inScope(scope, null)).toBe(false);
  });

  it('gives senior head-office staff every branch', async () => {
    expect(await branchScopeFor(viewer('hq', { roleLevel: 80 }))).toBeNull();
  });

  it('reads the branch from the database, so a transfer applies at once', async () => {
    h.branchOf.manager = 'branch-c';
    expect(await branchScopeFor(viewer('manager'))).toBe('branch-c');
  });

  it('never confines the superuser, even one posted to a branch', async () => {
    expect(await branchScopeFor(viewer('manager', { permissions: ['ADMIN:SYSTEM'] }))).toBeNull();
  });
});

describe('staffScopeFor', () => {
  it('lets HR administrators see every branch\'s people', async () => {
    expect(await staffScopeFor(viewer('hr', { permissions: ['HR:STAFF_READ', 'HR:STAFF_CREATE'] }))).toBeNull();
  });

  it('confines a manager reading HR to their own branch', async () => {
    expect(await staffScopeFor(viewer('manager', { permissions: ['HR:STAFF_READ'] }))).toBe('branch-a');
  });
});

describe('canOpenBranchesConsole', () => {
  it('opens to level 85 and up (General Manager, Director) and the superuser', () => {
    expect(canOpenBranchesConsole({ permissions: [], roleLevel: 85 })).toBe(true);
    expect(canOpenBranchesConsole({ permissions: [], roleLevel: 90 })).toBe(true);
    expect(canOpenBranchesConsole({ permissions: ['ADMIN:SYSTEM'], roleLevel: 10 })).toBe(true);
  });

  it('stays closed at HR level (80) without admin, and to IT', () => {
    expect(canOpenBranchesConsole({ permissions: [], roleLevel: 80 })).toBe(false);
    expect(canOpenBranchesConsole({ permissions: ['SYSTEM:CONFIG_MANAGE'], roleLevel: 55 })).toBe(false);
  });
});

describe('inScope', () => {
  it('shows everything to an unconfined viewer', () => {
    expect(inScope(null, 'branch-a')).toBe(true);
    expect(inScope(null, null)).toBe(true);
  });

  it('shows a confined viewer only their branch', () => {
    expect(inScope('branch-a', 'branch-a')).toBe(true);
    expect(inScope('branch-a', 'branch-b')).toBe(false);
  });

  it('hides head-office records from branch staff', () => {
    expect(inScope('branch-a', null)).toBe(false);
  });
});

describe('branchForNewRecord', () => {
  it('uses the branch the form asked for', async () => {
    expect(await branchForNewRecord({ id: 'officer' }, { requested: 'branch-x', customerId: 'cust-a' })).toBe('branch-x');
  });

  it("books an existing customer's account to the customer's branch", async () => {
    expect(await branchForNewRecord({ id: 'officer' }, { customerId: 'cust-a' })).toBe('branch-a');
  });

  it("falls back to the creator's posting, read from the database", async () => {
    expect(await branchForNewRecord({ id: 'officer' }, { customerId: 'cust-none' })).toBe('branch-b');
  });

  it('books head-office staff with no posting to HQ', async () => {
    expect(await branchForNewRecord({ id: 'hq' })).toBe('branch-hq');
  });

  it('uses the only active branch when there is just one', async () => {
    h.branches = [{ id: 'branch-a', code: 'IKJ' }];
    expect(await branchForNewRecord({ id: 'hq' })).toBe('branch-a');
  });

  it('gives null when there are several branches and no HQ', async () => {
    h.branches = [{ id: 'branch-a', code: 'IKJ' }, { id: 'branch-b', code: 'VI' }];
    expect(await branchForNewRecord({ id: 'hq' })).toBeNull();
  });
});
