'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { generateReference } from '@/lib/utils';
import { hash } from 'bcryptjs';
import type { ActionResult } from '@/types';

export async function createStaff(data: {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phone?: string;
  departmentId: string;
  roleId: string;
  branchId?: string;
  supervisorId?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  nationalId?: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:STAFF_CREATE');

    // Check email uniqueness
    const existing = await prisma.staff.findUnique({ where: { email: data.email } });
    if (existing) return { success: false, error: 'Email already in use' };

    const employeeId = await generateReference('EMPLOYEE');
    const tempPassword = `Hylink@${Math.random().toString(36).slice(-6)}`;
    const passwordHash = await hash(tempPassword, 12);

    const staff = await prisma.staff.create({
      data: {
        employeeId,
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender,
        address: data.address,
        nationalId: data.nationalId,
        departmentId: data.departmentId,
        roleId: data.roleId,
        branchId: data.branchId || undefined,
        supervisorId: data.supervisorId || undefined,
        mustChangePassword: true,
        createdBy: user.id,
      },
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR',
      entityType: 'STAFF', entityId: staff.id,
      description: `Created staff: ${data.firstName} ${data.lastName} (${employeeId})`,
      newValues: { employeeId, email: data.email, departmentId: data.departmentId, roleId: data.roleId },
    });

    return { success: true, message: `Staff created. Employee ID: ${employeeId}. Temp password: ${tempPassword}`, data: { employeeId, tempPassword } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateStaff(
  staffId: string,
  data: {
    firstName?: string;
    lastName?: string;
    middleName?: string;
    email?: string;
    phone?: string;
    departmentId?: string;
    roleId?: string;
    branchId?: string;
    supervisorId?: string;
    status?: string;
    address?: string;
  }
): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:STAFF_UPDATE');

    // Prevent self-editing — HR cannot modify their own record via this action
    if (user.id === staffId) {
      return { success: false, error: 'You cannot edit your own staff record' };
    }

    const oldStaff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!oldStaff) return { success: false, error: 'Staff not found' };

    // If email is changing, check uniqueness
    if (data.email && data.email !== oldStaff.email) {
      const emailExists = await prisma.staff.findUnique({ where: { email: data.email } });
      if (emailExists) return { success: false, error: 'Email already in use' };
    }

    const updateData: Record<string, unknown> = {};
    const changedFields: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== (oldStaff as any)[key]) {
        updateData[key] = value;
        changedFields.push(key);
      }
    }

    if (changedFields.length === 0) return { success: false, error: 'No changes detected' };

    await prisma.staff.update({
      where: { id: staffId },
      data: updateData as any,
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR',
      entityType: 'STAFF', entityId: staffId,
      description: `Updated staff ${oldStaff.employeeId}: ${changedFields.join(', ')}`,
      changedFields,
    });

    return { success: true, message: 'Staff updated successfully' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getStaffDetail(staffId: string) {
  await requirePermission('HR:STAFF_READ');

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    include: {
      department: true,
      role: { include: { permissions: { include: { permission: true } } } },
      branch: true,
      supervisor: { select: { firstName: true, lastName: true, employeeId: true } },
      subordinates: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
    },
  });

  if (!staff) throw new Error('Staff not found');
  return {
    ...staff,
    role: {
      ...staff.role,
      approvalLimit: staff.role.approvalLimit?.toNumber() ?? null,
    },
  };
}

export async function getDepartments() {
  const { user: _ } = await getSession();

  return prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { staff: true } } },
  });
}

export async function createDepartment(data: {
  code: string;
  name: string;
  description?: string;
}): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:STAFF_CREATE');

    const existing = await prisma.department.findFirst({
      where: { OR: [{ code: data.code }, { name: data.name }] },
    });
    if (existing) return { success: false, error: 'Department code or name already exists' };

    const dept = await prisma.department.create({
      data: { code: data.code, name: data.name, description: data.description },
    });

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR',
      entityType: 'DEPARTMENT', entityId: dept.id,
      description: `Created department: ${data.name} (${data.code})`,
    });

    return { success: true, message: 'Department created', data: dept };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateDepartment(
  id: string,
  data: { name?: string; description?: string; isActive?: boolean }
): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:STAFF_UPDATE');

    await prisma.department.update({ where: { id }, data: data as any });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR',
      entityType: 'DEPARTMENT', entityId: id,
      description: `Updated department`,
    });

    return { success: true, message: 'Department updated' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getRoles() {
  const { user: _ } = await getSession();

  const roles = await prisma.role.findMany({
    where: { isActive: true },
    orderBy: { level: 'asc' },
  });

  return roles.map((r) => ({
    ...r,
    approvalLimit: r.approvalLimit?.toNumber() ?? null,
  }));
}

export async function getBranches() {
  const { user: _ } = await getSession();

  return prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function getStaffDocuments(staffId: string) {
  await requirePermission('HR:STAFF_READ');

  return prisma.document.findMany({
    where: { staffId, isDeleted: false },
    include: {
      category: { select: { name: true } },
      uploadedBy: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getStaffActivityLogs(staffId: string) {
  await requirePermission('HR:STAFF_READ');

  // Get logs where staff is either the actor or the subject
  return prisma.auditLog.findMany({
    where: {
      OR: [
        { userId: staffId },
        { entityId: staffId, entityType: 'STAFF' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
