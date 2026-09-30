/**
 * Branch scoping.
 *
 * The rule this file defends: staff posted to a branch see only that branch's
 * customers and money. The superuser, directors and head office (no branch)
 * see every branch. HR administrators see every branch's people.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ branchOf: {} as Record<string, string | null> }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    staff: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id in h.branchOf ? { branchId: h.branchOf[where.id] } : null
      ),
    },
  },
}));

import {
  seesAllBranches, branchScopeFor, staffScopeFor, inScope, ALL_BRANCHES_ROLE_LEVEL,
} from '@/lib/branch-scope';

const viewer = (id: string, overrides: Partial<{ permissions: string[]; roleLevel: number }> = {}) => ({
  id,
  permissions: [] as string[],
  roleLevel: 70,
  ...overrides,
});

beforeEach(() => {
  h.branchOf = { manager: 'branch-a', officer: 'branch-b', hq: null, hr: 'branch-a' };
});

describe('seesAllBranches', () => {
  it('lets the superuser see every branch', () => {
    expect(seesAllBranches(viewer('x', { permissions: ['ADMIN:SYSTEM'], roleLevel: 10 }))).toBe(true);
  });

  it('lets a director see every branch', () => {
    expect(seesAllBranches(viewer('x', { roleLevel: ALL_BRANCHES_ROLE_LEVEL }))).toBe(true);
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

  it('gives head-office staff (no branch) every branch', async () => {
    expect(await branchScopeFor(viewer('hq'))).toBeNull();
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
