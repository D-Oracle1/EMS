'use server';

/**
 * Administration — Server Actions
 * Hylink Finance Limited EMS
 *
 * Roles & permissions, branches, departments, system configuration and
 * session control. Everything here is gated on SYSTEM:CONFIG_MANAGE or
 * SYSTEM:USER_MANAGE — the console a superuser needs so that provisioning
 * never requires running a seed script.
 */

import { prisma } from '@/lib/prisma';
import { requirePermission, requireAnyPermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import {
  listEffectiveConfig,
  setConfigValue,
  resetConfigValue,
  validateConfigValue,
  CONFIG_DEFINITIONS,
} from '@/lib/system-config';
import type { ActionResult } from '@/types';

// ============================================================================
// PERMISSIONS
// ============================================================================

export async function getAllPermissions() {
  await requireAnyPermission(['SYSTEM:USER_MANAGE', 'SYSTEM:CONFIG_MANAGE', 'ADMIN:SYSTEM']);

  const permissions = await prisma.permission.findMany({
    orderBy: [{ module: 'asc' }, { action: 'asc' }],
    include: { _count: { select: { rolePermissions: true } } },
  });

  return permissions.map((p) => ({
    id: p.id,
    code: p.code,
    module: p.module,
    action: p.action,
    description: p.description,
    roleCount: p._count.rolePermissions,
  }));
}

/** Permissions grouped by module — the shape the permission matrix renders from. */
export async function getPermissionMatrix() {
  await requireAnyPermission(['SYSTEM:USER_MANAGE', 'SYSTEM:CONFIG_MANAGE', 'ADMIN:SYSTEM']);

  const [permissions, roles] = await Promise.all([
    prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] }),
    prisma.role.findMany({
      orderBy: { level: 'desc' },
      include: {
        permissions: { select: { permissionId: true } },
        _count: { select: { staff: true } },
      },
    }),
  ]);

  const modules = new Map<string, Array<{ id: string; code: string; action: string; description: string | null }>>();
  for (const p of permissions) {
    if (!modules.has(p.module)) modules.set(p.module, []);
    modules.get(p.module)!.push({
      id: p.id,
      code: p.code,
      action: p.action,
      description: p.description,
    });
  }

  return {
    modules: Array.from(modules.entries()).map(([module, perms]) => ({ module, permissions: perms })),
    roles: roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      level: r.level,
      isActive: r.isActive,
      staffCount: r._count.staff,
      permissionIds: r.permissions.map((rp) => rp.permissionId),
    })),
  };
}

export async function createPermission(data: {
  module: string;
  action: string;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('ADMIN:SYSTEM');

    const module = data.module.trim().toUpperCase().replace(/\s+/g, '_');
    const action = data.action.trim().toUpperCase().replace(/\s+/g, '_');

    if (!module || !action) {
      return { success: false, error: 'Module and action are both required' };
    }
    if (!/^[A-Z0-9_]+$/.test(module) || !/^[A-Z0-9_]+$/.test(action)) {
      return { success: false, error: 'Module and action may only contain letters, digits and underscores' };
    }

    const code = `${module}:${action}`;
    const existing = await prisma.permission.findUnique({ where: { code } });
    if (existing) return { success: false, error: `Permission ${code} already exists` };

    const permission = await prisma.permission.create({
      data: { code, module, action, description: data.description?.trim() || `${action} in ${module}` },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'SYSTEM',
      entityType: 'PERMISSION',
      entityId: permission.id,
      description: `Created permission ${code}`,
    });

    return { success: true, message: `Permission ${code} created`, data: { id: permission.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deletePermission(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('ADMIN:SYSTEM');

    const permission = await prisma.permission.findUnique({
      where: { id },
      include: { _count: { select: { rolePermissions: true } } },
    });
    if (!permission) return { success: false, error: 'Permission not found' };
    if (permission._count.rolePermissions > 0) {
      return {
        success: false,
        error: `${permission.code} is assigned to ${permission._count.rolePermissions} role(s). Unassign it first.`,
      };
    }

    await prisma.permission.delete({ where: { id } });

    await auditLog({
      userId: user.id,
      action: 'DELETE',
      module: 'SYSTEM',
      entityType: 'PERMISSION',
      entityId: id,
      description: `Deleted permission ${permission.code}`,
    });

    return { success: true, message: `Permission ${permission.code} deleted` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// ROLES
// ============================================================================

export async function getRolesDetailed() {
  await requireAnyPermission(['SYSTEM:USER_MANAGE', 'SYSTEM:CONFIG_MANAGE', 'ADMIN:SYSTEM', 'HR:STAFF_READ']);

  const roles = await prisma.role.findMany({
    orderBy: { level: 'desc' },
    include: {
      permissions: { include: { permission: { select: { code: true, module: true } } } },
      _count: { select: { staff: true } },
    },
  });

  return roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    level: r.level,
    approvalLimit: r.approvalLimit ? Number(r.approvalLimit) : null,
    isActive: r.isActive,
    staffCount: r._count.staff,
    permissionCount: r.permissions.length,
    permissionCodes: r.permissions.map((rp) => rp.permission.code),
    modules: Array.from(new Set(r.permissions.map((rp) => rp.permission.module))).sort(),
    createdAt: r.createdAt,
  }));
}

export async function createRole(data: {
  code: string;
  name: string;
  description?: string;
  level: number;
  approvalLimit?: number;
  permissionIds: string[];
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('SYSTEM:USER_MANAGE');

    const code = data.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!code || !data.name.trim()) {
      return { success: false, error: 'Role code and name are required' };
    }
    if (data.level < 0 || data.level > 100) {
      return { success: false, error: 'Role level must be between 0 and 100' };
    }

    // A role may not be created at or above the creator's own authority.
    if (data.level >= user.roleLevel && user.roleCode !== 'SUPER_ADMIN') {
      return { success: false, error: 'You cannot create a role at or above your own authority level' };
    }

    const existing = await prisma.role.findUnique({ where: { code } });
    if (existing) return { success: false, error: `Role code ${code} is already in use` };

    // Never let a role be granted a permission the creator does not hold.
    const grantable = await filterGrantablePermissions(data.permissionIds, user.permissions, user.roleCode);
    if (grantable.rejected.length > 0) {
      return {
        success: false,
        error: `You cannot grant permissions you do not hold: ${grantable.rejected.join(', ')}`,
      };
    }

    const role = await prisma.role.create({
      data: {
        code,
        name: data.name.trim(),
        description: data.description?.trim(),
        level: data.level,
        approvalLimit: data.approvalLimit ?? null,
        isActive: true,
        permissions: {
          create: grantable.allowed.map((permissionId) => ({ permissionId })),
        },
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'SYSTEM',
      entityType: 'ROLE',
      entityId: role.id,
      description: `Created role ${data.name} [${code}] at level ${data.level} with ${grantable.allowed.length} permissions`,
      newValues: { code, name: data.name, level: data.level, permissionCount: grantable.allowed.length },
    });

    return { success: true, message: `Role "${data.name}" created`, data: { id: role.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateRole(
  id: string,
  data: {
    name?: string;
    description?: string;
    level?: number;
    approvalLimit?: number | null;
    isActive?: boolean;
  }
): Promise<ActionResult> {
  try {
    const user = await requirePermission('SYSTEM:USER_MANAGE');

    const role = await prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { staff: true } } },
    });
    if (!role) return { success: false, error: 'Role not found' };

    if (role.code === 'SUPER_ADMIN' && user.roleCode !== 'SUPER_ADMIN') {
      return { success: false, error: 'Only a Super Administrator may modify the Super Administrator role' };
    }
    if (role.level >= user.roleLevel && user.roleCode !== 'SUPER_ADMIN') {
      return { success: false, error: 'You cannot modify a role at or above your own authority level' };
    }
    if (data.isActive === false && role._count.staff > 0) {
      return {
        success: false,
        error: `Cannot deactivate a role held by ${role._count.staff} staff member(s). Reassign them first.`,
      };
    }
    if (data.level !== undefined && (data.level < 0 || data.level > 100)) {
      return { success: false, error: 'Role level must be between 0 and 100' };
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description.trim() || null;
    if (data.level !== undefined) updates.level = data.level;
    if (data.approvalLimit !== undefined) updates.approvalLimit = data.approvalLimit;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    await prisma.role.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SYSTEM',
      entityType: 'ROLE',
      entityId: id,
      description: `Updated role ${role.name} [${role.code}]`,
      oldValues: {
        name: role.name,
        level: role.level,
        approvalLimit: role.approvalLimit ? Number(role.approvalLimit) : null,
        isActive: role.isActive,
      },
      newValues: updates,
      changedFields: Object.keys(updates),
    });

    return { success: true, message: `Role "${role.name}" updated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Replace a role's permission set. Staff holding the role pick the change up
 * on their next sign-in, since permissions are resolved into the JWT at login.
 */
export async function setRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<ActionResult<{ added: number; removed: number; reloginRequired: number }>> {
  try {
    const user = await requirePermission('SYSTEM:USER_MANAGE');

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: { select: { permissionId: true } },
        _count: { select: { staff: true } },
      },
    });
    if (!role) return { success: false, error: 'Role not found' };

    if (role.code === 'SUPER_ADMIN' && user.roleCode !== 'SUPER_ADMIN') {
      return { success: false, error: 'Only a Super Administrator may modify the Super Administrator role' };
    }
    if (role.level >= user.roleLevel && user.roleCode !== 'SUPER_ADMIN') {
      return { success: false, error: 'You cannot modify a role at or above your own authority level' };
    }

    const grantable = await filterGrantablePermissions(permissionIds, user.permissions, user.roleCode);
    if (grantable.rejected.length > 0) {
      return {
        success: false,
        error: `You cannot grant permissions you do not hold: ${grantable.rejected.join(', ')}`,
      };
    }

    const current = new Set(role.permissions.map((rp) => rp.permissionId));
    const desired = new Set(grantable.allowed);

    const toAdd = grantable.allowed.filter((pid) => !current.has(pid));
    const toRemove = Array.from(current).filter((pid) => !desired.has(pid));

    // Guard against locking every administrator out of the console.
    if (role.code === 'SUPER_ADMIN') {
      const adminPerm = await prisma.permission.findUnique({ where: { code: 'ADMIN:SYSTEM' } });
      if (adminPerm && toRemove.includes(adminPerm.id)) {
        return { success: false, error: 'ADMIN:SYSTEM cannot be removed from the Super Administrator role' };
      }
    }

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId, permissionId: { in: toRemove } } }),
      prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      }),
    ]);

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SYSTEM',
      entityType: 'ROLE_PERMISSIONS',
      entityId: roleId,
      description: `Updated permissions for role ${role.name}: +${toAdd.length} / -${toRemove.length}`,
      metadata: { added: toAdd.length, removed: toRemove.length },
    });

    return {
      success: true,
      message:
        role._count.staff > 0
          ? `Permissions updated. ${role._count.staff} staff member(s) must sign in again for the change to take effect.`
          : 'Permissions updated',
      data: { added: toAdd.length, removed: toRemove.length, reloginRequired: role._count.staff },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Reject any permission the acting user does not themselves hold, so a role
 * can never be used to escalate beyond its creator. Super Admins bypass this.
 */
async function filterGrantablePermissions(
  permissionIds: string[],
  userPermissions: string[],
  userRoleCode: string
): Promise<{ allowed: string[]; rejected: string[] }> {
  const unique = Array.from(new Set(permissionIds));
  if (unique.length === 0) return { allowed: [], rejected: [] };

  const permissions = await prisma.permission.findMany({
    where: { id: { in: unique } },
    select: { id: true, code: true },
  });

  if (userRoleCode === 'SUPER_ADMIN') {
    return { allowed: permissions.map((p) => p.id), rejected: [] };
  }

  const held = new Set(userPermissions);
  const allowed: string[] = [];
  const rejected: string[] = [];

  for (const p of permissions) {
    if (held.has(p.code)) allowed.push(p.id);
    else rejected.push(p.code);
  }

  return { allowed, rejected };
}

// ============================================================================
// BRANCHES
// ============================================================================

export async function getBranchesDetailed() {
  await requireAnyPermission(['SYSTEM:CONFIG_MANAGE', 'HR:STAFF_READ', 'ADMIN:SYSTEM']);

  const branches = await prisma.branch.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: {
        select: { staff: true, customers: true, loans: true, savings: true, fixedDeposits: true },
      },
    },
  });

  return branches.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.address,
    phone: b.phone,
    email: b.email,
    isActive: b.isActive,
    staffCount: b._count.staff,
    customerCount: b._count.customers,
    loanCount: b._count.loans,
    savingsCount: b._count.savings,
    fixedDepositCount: b._count.fixedDeposits,
    createdAt: b.createdAt,
  }));
}

export async function createBranch(data: {
  code: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    const code = data.code.trim().toUpperCase().replace(/\s+/g, '');
    if (!code || !data.name.trim()) {
      return { success: false, error: 'Branch code and name are required' };
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      return { success: false, error: 'Enter a valid email address' };
    }

    const existing = await prisma.branch.findUnique({ where: { code } });
    if (existing) return { success: false, error: `Branch code ${code} is already in use` };

    const branch = await prisma.branch.create({
      data: {
        code,
        name: data.name.trim(),
        address: data.address?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        isActive: true,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'SYSTEM',
      entityType: 'BRANCH',
      entityId: branch.id,
      description: `Created branch ${data.name} [${code}]`,
    });

    return { success: true, message: `Branch "${data.name}" created`, data: { id: branch.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateBranch(
  id: string,
  data: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    isActive?: boolean;
  }
): Promise<ActionResult> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: { _count: { select: { staff: true, loans: true, savings: true } } },
    });
    if (!branch) return { success: false, error: 'Branch not found' };

    if (data.isActive === false) {
      const active = branch._count.staff + branch._count.loans + branch._count.savings;
      if (active > 0) {
        return {
          success: false,
          error: `Cannot deactivate a branch with ${branch._count.staff} staff, ${branch._count.loans} loans and ${branch._count.savings} savings accounts attached.`,
        };
      }
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      return { success: false, error: 'Enter a valid email address' };
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.address !== undefined) updates.address = data.address.trim() || null;
    if (data.phone !== undefined) updates.phone = data.phone.trim() || null;
    if (data.email !== undefined) updates.email = data.email.trim() || null;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    await prisma.branch.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SYSTEM',
      entityType: 'BRANCH',
      entityId: id,
      description: `Updated branch ${branch.name} [${branch.code}]`,
      oldValues: { name: branch.name, address: branch.address, isActive: branch.isActive },
      newValues: updates,
      changedFields: Object.keys(updates),
    });

    return { success: true, message: `Branch "${branch.name}" updated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// DEPARTMENTS
// ============================================================================

export async function getDepartmentsDetailed() {
  await requireAnyPermission(['SYSTEM:CONFIG_MANAGE', 'HR:STAFF_READ', 'ADMIN:SYSTEM']);

  const departments = await prisma.department.findMany({
    orderBy: { code: 'asc' },
    include: { _count: { select: { staff: true } } },
  });

  return departments.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    description: d.description,
    isActive: d.isActive,
    staffCount: d._count.staff,
    createdAt: d.createdAt,
  }));
}

export async function deactivateDepartment(id: string): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['SYSTEM:CONFIG_MANAGE', 'HR:STAFF_UPDATE']);

    const department = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { staff: true } } },
    });
    if (!department) return { success: false, error: 'Department not found' };
    if (!department.isActive) return { success: false, error: 'Department is already inactive' };
    if (department._count.staff > 0) {
      return {
        success: false,
        error: `Cannot deactivate a department with ${department._count.staff} staff member(s). Reassign them first.`,
      };
    }

    await prisma.department.update({ where: { id }, data: { isActive: false } });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SYSTEM',
      entityType: 'DEPARTMENT',
      entityId: id,
      description: `Deactivated department ${department.name} [${department.code}]`,
    });

    return { success: true, message: `Department "${department.name}" deactivated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function reactivateDepartment(id: string): Promise<ActionResult> {
  try {
    const user = await requireAnyPermission(['SYSTEM:CONFIG_MANAGE', 'HR:STAFF_UPDATE']);

    const department = await prisma.department.findUnique({ where: { id } });
    if (!department) return { success: false, error: 'Department not found' };
    if (department.isActive) return { success: false, error: 'Department is already active' };

    await prisma.department.update({ where: { id }, data: { isActive: true } });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SYSTEM',
      entityType: 'DEPARTMENT',
      entityId: id,
      description: `Reactivated department ${department.name} [${department.code}]`,
    });

    return { success: true, message: `Department "${department.name}" reactivated` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// SYSTEM CONFIGURATION
// ============================================================================

export async function getSystemConfig() {
  await requireAnyPermission(['SYSTEM:CONFIG_MANAGE', 'ADMIN:SYSTEM']);

  const entries = await listEffectiveConfig();

  const byCategory = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
    byCategory.get(entry.category)!.push(entry);
  }

  return {
    categories: Array.from(byCategory.entries()).map(([category, settings]) => ({
      category,
      settings: settings.map((s) => ({
        key: s.key,
        label: s.label,
        description: s.description,
        dataType: s.dataType,
        value: s.isSecret ? '••••••••' : s.value,
        defaultValue: s.defaultValue,
        isOverridden: s.isOverridden,
        isEditable: s.isEditable ?? true,
        isSecret: s.isSecret ?? false,
        updatedAt: s.updatedAt,
      })),
    })),
    totalSettings: entries.length,
    overriddenCount: entries.filter((e) => e.isOverridden).length,
  };
}

export async function updateSystemConfig(
  updates: Array<{ key: string; value: string }>
): Promise<ActionResult<{ updated: number }>> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    if (updates.length === 0) return { success: false, error: 'No changes supplied' };

    // Validate everything before writing anything.
    const validated: Array<{ key: string; value: string }> = [];
    for (const update of updates) {
      const result = validateConfigValue(update.key, update.value);
      if (!result.ok) return { success: false, error: result.error };
      validated.push({ key: update.key, value: result.value });
    }

    const previous = await prisma.systemConfig.findMany({
      where: { key: { in: validated.map((v) => v.key) } },
      select: { key: true, value: true },
    });
    const previousByKey = new Map(previous.map((p) => [p.key, p.value]));

    for (const { key, value } of validated) {
      await setConfigValue(key, value, user.id);
    }

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SYSTEM',
      entityType: 'SYSTEM_CONFIG',
      description: `Updated ${validated.length} system setting(s): ${validated.map((v) => v.key).join(', ')}`,
      oldValues: Object.fromEntries(validated.map((v) => [v.key, previousByKey.get(v.key) ?? '(default)'])),
      newValues: Object.fromEntries(validated.map((v) => [v.key, v.value])),
      changedFields: validated.map((v) => v.key),
    });

    return { success: true, message: `${validated.length} setting(s) saved`, data: { updated: validated.length } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resetSystemConfig(key: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('SYSTEM:CONFIG_MANAGE');

    const definition = CONFIG_DEFINITIONS.find((d) => d.key === key);
    if (!definition) return { success: false, error: `Unknown configuration key: ${key}` };

    await resetConfigValue(key);

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SYSTEM',
      entityType: 'SYSTEM_CONFIG',
      description: `Reset "${definition.label}" to its default (${definition.defaultValue})`,
    });

    return { success: true, message: `"${definition.label}" reset to default` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// SESSIONS
// ============================================================================

export async function getActiveSessions(filters?: { staffId?: string; includeExpired?: boolean }) {
  await requireAnyPermission(['SYSTEM:USER_MANAGE', 'ADMIN:SYSTEM']);

  const where: Record<string, unknown> = {};
  if (filters?.staffId) where.staffId = filters.staffId;
  if (!filters?.includeExpired) {
    where.revokedAt = null;
    where.expiresAt = { gt: new Date() };
  }

  const sessions = await prisma.userSession.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      staff: {
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          email: true,
          role: { select: { name: true } },
        },
      },
    },
  });

  const now = new Date();
  return sessions.map((s) => ({
    id: s.id,
    staffId: s.staffId,
    staffName: `${s.staff.firstName} ${s.staff.lastName}`,
    employeeId: s.staff.employeeId,
    email: s.staff.email,
    roleName: s.staff.role.name,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
    isActive: !s.revokedAt && s.expiresAt > now,
  }));
}

export async function revokeSession(sessionId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('SYSTEM:USER_MANAGE');

    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      include: { staff: { select: { firstName: true, lastName: true } } },
    });
    if (!session) return { success: false, error: 'Session not found' };
    if (session.revokedAt) return { success: false, error: 'Session is already revoked' };

    await prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SYSTEM',
      entityType: 'USER_SESSION',
      entityId: sessionId,
      description: `Revoked session for ${session.staff.firstName} ${session.staff.lastName}`,
    });

    return {
      success: true,
      message: `Session revoked for ${session.staff.firstName} ${session.staff.lastName}`,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function revokeAllSessionsForStaff(staffId: string): Promise<ActionResult<{ revoked: number }>> {
  try {
    const user = await requirePermission('SYSTEM:USER_MANAGE');

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { firstName: true, lastName: true },
    });
    if (!staff) return { success: false, error: 'Staff not found' };

    const result = await prisma.userSession.updateMany({
      where: { staffId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'SYSTEM',
      entityType: 'USER_SESSION',
      entityId: staffId,
      description: `Revoked all ${result.count} session(s) for ${staff.firstName} ${staff.lastName}`,
    });

    return {
      success: true,
      message: `${result.count} session(s) revoked for ${staff.firstName} ${staff.lastName}`,
      data: { revoked: result.count },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Housekeeping: clear out sessions that expired more than 30 days ago. */
export async function purgeExpiredSessions(): Promise<ActionResult<{ purged: number }>> {
  try {
    const user = await requirePermission('SYSTEM:USER_MANAGE');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const result = await prisma.userSession.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });

    await auditLog({
      userId: user.id,
      action: 'DELETE',
      module: 'SYSTEM',
      entityType: 'USER_SESSION',
      description: `Purged ${result.count} session(s) expired before ${cutoff.toISOString().slice(0, 10)}`,
    });

    return { success: true, message: `${result.count} expired session(s) purged`, data: { purged: result.count } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** The signed-in user's own sessions — available without admin rights. */
export async function getMySessions() {
  const { user } = await getSession();

  const sessions = await prisma.userSession.findMany({
    where: { staffId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return sessions.map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
  }));
}
