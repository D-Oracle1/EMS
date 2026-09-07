/**
 * Role administration: the privilege-escalation guards.
 *
 * A console that can create roles is a console that can escalate privilege, so
 * these are the rules that matter: nobody may create or edit a role at or above
 * their own authority level, nobody may grant a permission they do not hold,
 * only a Super Administrator may touch the Super Administrator role, and
 * ADMIN:SYSTEM can never be stripped from it. Super Admin is the one exemption.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sessionUser } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    user: null as any,
    permissionError: null as string | null,
    roles: [] as any[],
    permissions: [] as any[],
    createdRoles: [] as any[],
    roleUpdates: [] as any[],
    rolePermissionDeletes: [] as any[],
    rolePermissionCreates: [] as any[],
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  return {
    prisma: {
      role: {
        findUnique: vi.fn(async (args: any) => {
          if (args.where.id) return state.roles.find((r) => r.id === args.where.id) ?? null;
          if (args.where.code) return state.roles.find((r) => r.code === args.where.code) ?? null;
          return null;
        }),
        findMany: vi.fn(async () => state.roles),
        create: vi.fn(async (args: any) => {
          const row = { id: 'role-new', ...args.data };
          state.createdRoles.push(args.data);
          return row;
        }),
        update: vi.fn(async (args: any) => {
          state.roleUpdates.push({ id: args.where.id, ...args.data });
          return args.data;
        }),
      },
      permission: {
        findMany: vi.fn(async (args: any) => {
          const ids: string[] | undefined = args?.where?.id?.in;
          if (!ids) return state.permissions;
          return state.permissions.filter((p) => ids.includes(p.id));
        }),
        findUnique: vi.fn(async (args: any) =>
          state.permissions.find((p) => p.code === args.where.code) ?? null
        ),
      },
      rolePermission: {
        deleteMany: vi.fn(async (args: any) => {
          state.rolePermissionDeletes.push(args);
          return { count: 0 };
        }),
        createMany: vi.fn(async (args: any) => {
          state.rolePermissionCreates.push(args);
          return { count: args.data.length };
        }),
      },
      $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
    },
    withTransaction: vi.fn(async (fn: any) => fn({})),
  };
});

vi.mock('@/lib/auth-utils', () => {
  const { state } = h;
  const guard = async () => {
    if (state.permissionError) throw new Error(state.permissionError);
    return state.user;
  };
  return {
    requirePermission: vi.fn(guard),
    requireAnyPermission: vi.fn(guard),
    getSession: vi.fn(async () => ({ user: state.user })),
  };
});

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/system-config', () => ({
  listEffectiveConfig: vi.fn(async () => []),
  setConfigValue: vi.fn(async () => undefined),
  resetConfigValue: vi.fn(async () => undefined),
  validateConfigValue: vi.fn(() => ({ ok: true, value: 'x' })),
  CONFIG_DEFINITIONS: [],
}));

const { createRole, updateRole, setRolePermissions } = await import('@/actions/admin.actions');

/** Permissions the fixture universe knows about. */
const PERMS = [
  { id: 'p-read', code: 'CUSTOMERS:READ', module: 'CUSTOMERS' },
  { id: 'p-create', code: 'CUSTOMERS:CREATE', module: 'CUSTOMERS' },
  { id: 'p-approve', code: 'LOANS:APPROVE_L2', module: 'LOANS' },
  { id: 'p-admin', code: 'ADMIN:SYSTEM', module: 'ADMIN' },
];

function role(overrides: Record<string, any> = {}) {
  return {
    id: 'role-1',
    code: 'OFFICER',
    name: 'Officer',
    level: 30,
    approvalLimit: null,
    isActive: true,
    permissions: [],
    _count: { staff: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  h.state.permissionError = null;
  h.state.permissions = [...PERMS];
  h.state.roles = [];
  h.state.createdRoles = [];
  h.state.roleUpdates = [];
  h.state.rolePermissionDeletes = [];
  h.state.rolePermissionCreates = [];

  // A manager who holds two customer permissions but not L2 approval or admin.
  h.state.user = sessionUser({
    roleCode: 'MANAGER',
    roleLevel: 70,
    permissions: ['CUSTOMERS:READ', 'CUSTOMERS:CREATE', 'SYSTEM:USER_MANAGE'],
  });
});

// ============================================================================
// CREATE
// ============================================================================

describe('createRole', () => {
  it('creates a role below the actor authority level', async () => {
    const result = await createRole({
      code: 'branch_lead',
      name: 'Branch Lead',
      level: 50,
      permissionIds: ['p-read'],
    });

    expect(result.success).toBe(true);
    // The code is normalised to upper snake case
    expect(h.state.createdRoles[0].code).toBe('BRANCH_LEAD');
  });

  it('refuses a role at the actor own authority level', async () => {
    const result = await createRole({
      code: 'PEER',
      name: 'Peer',
      level: 70,
      permissionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at or above your own authority/i);
  });

  it('refuses a role above the actor authority level', async () => {
    const result = await createRole({
      code: 'BOSS',
      name: 'Boss',
      level: 90,
      permissionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at or above your own authority/i);
  });

  it('refuses to grant a permission the actor does not hold', async () => {
    const result = await createRole({
      code: 'ESCALATED',
      name: 'Escalated',
      level: 50,
      permissionIds: ['p-read', 'p-approve'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot grant permissions you do not hold/i);
    expect(result.error).toContain('LOANS:APPROVE_L2');
    expect(h.state.createdRoles).toHaveLength(0);
  });

  it('lets a Super Administrator grant a permission they do not personally hold', async () => {
    h.state.user = sessionUser({
      roleCode: 'SUPER_ADMIN',
      roleLevel: 100,
      permissions: ['SYSTEM:USER_MANAGE'],
    });

    const result = await createRole({
      code: 'APPROVER',
      name: 'Approver',
      level: 60,
      permissionIds: ['p-approve'],
    });

    expect(result.success).toBe(true);
  });

  it('lets a Super Administrator create a role at their own level', async () => {
    h.state.user = sessionUser({
      roleCode: 'SUPER_ADMIN',
      roleLevel: 100,
      permissions: ['SYSTEM:USER_MANAGE'],
    });

    const result = await createRole({
      code: 'CO_ADMIN',
      name: 'Co Administrator',
      level: 100,
      permissionIds: [],
    });

    expect(result.success).toBe(true);
  });

  it('refuses a duplicate role code', async () => {
    h.state.roles = [role({ code: 'BRANCH_LEAD' })];

    const result = await createRole({
      code: 'BRANCH_LEAD',
      name: 'Branch Lead',
      level: 50,
      permissionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already in use/i);
  });

  it('refuses a level outside 0-100', async () => {
    const result = await createRole({
      code: 'ODD',
      name: 'Odd',
      level: 150,
      permissionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/between 0 and 100/i);
  });

  it('requires a code and a name', async () => {
    const result = await createRole({ code: '  ', name: '  ', level: 10, permissionIds: [] });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/required/i);
  });
});

// ============================================================================
// UPDATE
// ============================================================================

describe('updateRole', () => {
  it('updates a role below the actor level', async () => {
    h.state.roles = [role({ level: 30 })];

    const result = await updateRole('role-1', { name: 'Senior Officer' });

    expect(result.success).toBe(true);
    expect(h.state.roleUpdates[0].name).toBe('Senior Officer');
  });

  it('refuses to update a role at or above the actor level', async () => {
    h.state.roles = [role({ level: 70 })];

    const result = await updateRole('role-1', { name: 'Renamed' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at or above your own authority/i);
  });

  it('refuses a non-super-admin touching the Super Administrator role', async () => {
    h.state.roles = [role({ code: 'SUPER_ADMIN', level: 100 })];

    const result = await updateRole('role-1', { name: 'Renamed' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/only a super administrator/i);
  });

  it('refuses to deactivate a role that staff still hold', async () => {
    h.state.roles = [role({ level: 30, _count: { staff: 4 } })];

    const result = await updateRole('role-1', { isActive: false });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/4 staff member/i);
  });

  it('allows deactivating a role nobody holds', async () => {
    h.state.roles = [role({ level: 30, _count: { staff: 0 } })];

    const result = await updateRole('role-1', { isActive: false });

    expect(result.success).toBe(true);
  });

  it('reports a missing role rather than throwing', async () => {
    const result = await updateRole('nope', { name: 'X' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

// ============================================================================
// PERMISSION ASSIGNMENT
// ============================================================================

describe('setRolePermissions', () => {
  it('adds and removes to reach exactly the requested set', async () => {
    h.state.roles = [
      role({ level: 30, permissions: [{ permissionId: 'p-read' }] }),
    ];

    const result = await setRolePermissions('role-1', ['p-create']);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ added: 1, removed: 1, reloginRequired: 0 });
    expect(h.state.rolePermissionDeletes[0].where.permissionId.in).toEqual(['p-read']);
    expect(h.state.rolePermissionCreates[0].data).toEqual([
      { roleId: 'role-1', permissionId: 'p-create' },
    ]);
  });

  it('refuses to grant a permission the actor does not hold', async () => {
    h.state.roles = [role({ level: 30 })];

    const result = await setRolePermissions('role-1', ['p-approve']);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot grant permissions you do not hold/i);
    expect(h.state.rolePermissionCreates).toHaveLength(0);
  });

  it('refuses a role at or above the actor level', async () => {
    h.state.roles = [role({ level: 70 })];

    const result = await setRolePermissions('role-1', ['p-read']);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at or above your own authority/i);
  });

  it('refuses a non-super-admin editing the Super Administrator role', async () => {
    h.state.roles = [role({ code: 'SUPER_ADMIN', level: 100 })];

    const result = await setRolePermissions('role-1', ['p-read']);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/only a super administrator/i);
  });

  it('never lets ADMIN:SYSTEM be stripped from the Super Administrator role', async () => {
    h.state.user = sessionUser({
      roleCode: 'SUPER_ADMIN',
      roleLevel: 100,
      permissions: ['SYSTEM:USER_MANAGE'],
    });
    h.state.roles = [
      role({
        code: 'SUPER_ADMIN',
        level: 100,
        permissions: [{ permissionId: 'p-admin' }, { permissionId: 'p-read' }],
      }),
    ];

    // Ask for a set that omits ADMIN:SYSTEM — the lockout guard must refuse.
    const result = await setRolePermissions('role-1', ['p-read']);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ADMIN:SYSTEM cannot be removed/i);
    expect(h.state.rolePermissionDeletes).toHaveLength(0);
  });

  it('warns that staff must sign in again when the role is in use', async () => {
    h.state.roles = [
      role({ level: 30, permissions: [], _count: { staff: 7 } }),
    ];

    const result = await setRolePermissions('role-1', ['p-read']);

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/7 staff member\(s\) must sign in again/i);
    expect(result.data?.reloginRequired).toBe(7);
  });

  it('deduplicates a repeated permission id', async () => {
    h.state.roles = [role({ level: 30, permissions: [] })];

    const result = await setRolePermissions('role-1', ['p-read', 'p-read', 'p-read']);

    expect(result.success).toBe(true);
    expect(h.state.rolePermissionCreates[0].data).toHaveLength(1);
  });

  it('handles clearing every permission', async () => {
    h.state.roles = [
      role({ level: 30, permissions: [{ permissionId: 'p-read' }, { permissionId: 'p-create' }] }),
    ];

    const result = await setRolePermissions('role-1', []);

    expect(result.success).toBe(true);
    expect(result.data?.removed).toBe(2);
    expect(result.data?.added).toBe(0);
  });

  it('reports a missing role rather than throwing', async () => {
    const result = await setRolePermissions('nope', ['p-read']);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('surfaces a permission-guard failure as an error result', async () => {
    h.state.permissionError = 'Permission denied: SYSTEM:USER_MANAGE';

    const result = await setRolePermissions('role-1', ['p-read']);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/permission denied/i);
  });
});
