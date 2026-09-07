'use server';

/**
 * Employee Lifecycle — Server Actions
 * Hylink Finance Limited EMS
 *
 * Onboarding and offboarding checklists, staff movements (promotion, transfer,
 * confirmation) and the exit process. A movement is the audited record of a
 * change to someone's position — applying it also updates the staff record, so
 * the two can never drift apart.
 */

import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission, requireAnyPermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import type { ActionResult } from '@/types';

// ============================================================================
// ONBOARDING TEMPLATES
// ============================================================================

export async function getOnboardingTemplates(type?: 'ONBOARDING' | 'OFFBOARDING') {
  await requireAnyPermission(['HR:STAFF_READ', 'HR:CONFIG_MANAGE', 'SYSTEM:CONFIG_MANAGE']);

  const templates = await prisma.onboardingTemplate.findMany({
    where: type ? { type } : {},
    orderBy: { name: 'asc' },
    include: {
      department: { select: { name: true } },
      tasks: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { onboardings: true } },
    },
  });

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    departmentId: t.departmentId,
    departmentName: t.department?.name ?? null,
    description: t.description,
    isActive: t.isActive,
    usageCount: t._count.onboardings,
    tasks: t.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      category: task.category,
      dueDayOffset: task.dueDayOffset,
      ownerRoleCode: task.ownerRoleCode,
      isMandatory: task.isMandatory,
      sortOrder: task.sortOrder,
    })),
  }));
}

export async function createOnboardingTemplate(data: {
  name: string;
  type: 'ONBOARDING' | 'OFFBOARDING';
  departmentId?: string;
  description?: string;
  tasks: Array<{
    title: string;
    description?: string;
    category?: string;
    dueDayOffset?: number;
    ownerRoleCode?: string;
    isMandatory?: boolean;
  }>;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAnyPermission(['HR:CONFIG_MANAGE', 'SYSTEM:CONFIG_MANAGE']);

    if (!data.name.trim()) return { success: false, error: 'Template name is required' };
    if (data.tasks.length === 0) return { success: false, error: 'Add at least one task to the template' };
    if (data.tasks.some((t) => !t.title.trim())) {
      return { success: false, error: 'Every task needs a title' };
    }

    const template = await prisma.onboardingTemplate.create({
      data: {
        name: data.name.trim(),
        type: data.type,
        departmentId: data.departmentId || null,
        description: data.description?.trim() || null,
        tasks: {
          create: data.tasks.map((task, index) => ({
            title: task.title.trim(),
            description: task.description?.trim() || null,
            category: task.category ?? 'GENERAL',
            dueDayOffset: task.dueDayOffset ?? 0,
            ownerRoleCode: task.ownerRoleCode || null,
            isMandatory: task.isMandatory ?? true,
            sortOrder: index,
          })),
        },
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'ONBOARDING_TEMPLATE',
      entityId: template.id,
      description: `Created ${data.type.toLowerCase()} template "${data.name}" with ${data.tasks.length} task(s)`,
    });

    return { success: true, message: `Template "${data.name}" created`, data: { id: template.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STAFF ONBOARDING / OFFBOARDING
// ============================================================================

export async function getOnboardings(filters?: {
  status?: string;
  type?: 'ONBOARDING' | 'OFFBOARDING';
  staffId?: string;
}) {
  await requireAnyPermission(['HR:STAFF_READ', 'HR:STAFF_UPDATE']);

  const where: Record<string, unknown> = {};
  if (filters?.status && filters.status !== 'ALL') where.status = filters.status;
  if (filters?.type) where.type = filters.type;
  if (filters?.staffId) where.staffId = filters.staffId;

  const onboardings = await prisma.staffOnboarding.findMany({
    where,
    orderBy: { startDate: 'desc' },
    include: {
      staff: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          department: { select: { name: true } },
        },
      },
      template: { select: { name: true } },
      tasks: { select: { status: true, isMandatory: true } },
    },
  });

  return onboardings.map((o) => {
    const total = o.tasks.length;
    const done = o.tasks.filter((t) => t.status === 'COMPLETED' || t.status === 'SKIPPED').length;
    const blocked = o.tasks.filter((t) => t.status === 'BLOCKED').length;

    return {
      id: o.id,
      staffId: o.staffId,
      staffName: `${o.staff.firstName} ${o.staff.lastName}`,
      employeeId: o.staff.employeeId,
      jobTitle: o.staff.jobTitle,
      department: o.staff.department.name,
      templateName: o.template?.name ?? null,
      type: o.type,
      status: o.status,
      startDate: o.startDate,
      targetDate: o.targetDate,
      completedAt: o.completedAt,
      totalTasks: total,
      completedTasks: done,
      blockedTasks: blocked,
      progressPercent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });
}

export async function getOnboardingDetail(id: string) {
  const { user } = await getSession();

  const onboarding = await prisma.staffOnboarding.findUnique({
    where: { id },
    include: {
      staff: {
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
          hireDate: true,
          department: { select: { name: true } },
        },
      },
      template: { select: { name: true } },
      tasks: {
        orderBy: [{ sortOrder: 'asc' }],
        include: {
          assignee: { select: { firstName: true, lastName: true } },
          completedBy: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!onboarding) throw new Error('Onboarding record not found');

  // The subject, an assignee, or HR may view.
  const isAssignee = onboarding.tasks.some((t) => t.assigneeId === user.id);
  if (onboarding.staffId !== user.id && !isAssignee) {
    await requireAnyPermission(['HR:STAFF_READ', 'HR:STAFF_UPDATE']);
  }

  return {
    id: onboarding.id,
    type: onboarding.type,
    status: onboarding.status,
    startDate: onboarding.startDate,
    targetDate: onboarding.targetDate,
    completedAt: onboarding.completedAt,
    notes: onboarding.notes,
    templateName: onboarding.template?.name ?? null,
    staff: {
      id: onboarding.staff.id,
      employeeId: onboarding.staff.employeeId,
      name: `${onboarding.staff.firstName} ${onboarding.staff.lastName}`,
      email: onboarding.staff.email,
      jobTitle: onboarding.staff.jobTitle,
      department: onboarding.staff.department.name,
      hireDate: onboarding.staff.hireDate,
    },
    tasks: onboarding.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      dueDate: t.dueDate,
      isMandatory: t.isMandatory,
      status: t.status,
      assigneeId: t.assigneeId,
      assignee: t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : null,
      completedBy: t.completedBy ? `${t.completedBy.firstName} ${t.completedBy.lastName}` : null,
      completedAt: t.completedAt,
      notes: t.notes,
      isOverdue:
        t.status !== 'COMPLETED' && t.status !== 'SKIPPED' && t.dueDate ? t.dueDate < new Date() : false,
    })),
  };
}

/** Start a checklist for a staff member, materialising the template's tasks. */
export async function startOnboarding(data: {
  staffId: string;
  templateId?: string;
  type: 'ONBOARDING' | 'OFFBOARDING';
  startDate: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:STAFF_UPDATE');

    const staff = await prisma.staff.findUnique({
      where: { id: data.staffId },
      select: { id: true, firstName: true, lastName: true, departmentId: true, isDeleted: true },
    });
    if (!staff || staff.isDeleted) return { success: false, error: 'Staff not found' };

    const startDate = new Date(data.startDate);
    if (Number.isNaN(startDate.getTime())) return { success: false, error: 'Enter a valid start date' };
    startDate.setHours(0, 0, 0, 0);

    const existing = await prisma.staffOnboarding.findFirst({
      where: { staffId: data.staffId, type: data.type, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
    });
    if (existing) {
      return {
        success: false,
        error: `${staff.firstName} already has an open ${data.type.toLowerCase()} checklist`,
      };
    }

    // Fall back to a department-specific template, then a global one.
    let templateId = data.templateId;
    if (!templateId) {
      const template =
        (await prisma.onboardingTemplate.findFirst({
          where: { type: data.type, isActive: true, departmentId: staff.departmentId },
        })) ??
        (await prisma.onboardingTemplate.findFirst({
          where: { type: data.type, isActive: true, departmentId: null },
        }));
      templateId = template?.id;
    }

    const templateTasks = templateId
      ? await prisma.onboardingTemplateTask.findMany({
          where: { templateId },
          orderBy: { sortOrder: 'asc' },
        })
      : [];

    if (templateTasks.length === 0) {
      return {
        success: false,
        error: `No ${data.type.toLowerCase()} template is configured. Create one first.`,
      };
    }

    // Resolve default owners by role code, so tasks land on a real person.
    const roleCodes = Array.from(
      new Set(templateTasks.map((t) => t.ownerRoleCode).filter((c): c is string => Boolean(c)))
    );
    const owners = roleCodes.length
      ? await prisma.staff.findMany({
          where: { status: 'ACTIVE', isDeleted: false, role: { code: { in: roleCodes } } },
          select: { id: true, role: { select: { code: true } } },
        })
      : [];
    const ownerByRole = new Map<string, string>();
    for (const owner of owners) {
      if (!ownerByRole.has(owner.role.code)) ownerByRole.set(owner.role.code, owner.id);
    }

    let maxOffset = 0;
    for (const task of templateTasks) maxOffset = Math.max(maxOffset, task.dueDayOffset);
    const targetDate = new Date(startDate);
    targetDate.setDate(targetDate.getDate() + maxOffset);

    const onboarding = await prisma.staffOnboarding.create({
      data: {
        staffId: data.staffId,
        templateId: templateId || null,
        type: data.type,
        status: 'IN_PROGRESS',
        startDate,
        targetDate,
        notes: data.notes?.trim() || null,
        tasks: {
          create: templateTasks.map((task) => {
            const dueDate = new Date(startDate);
            dueDate.setDate(dueDate.getDate() + task.dueDayOffset);
            return {
              title: task.title,
              description: task.description,
              category: task.category,
              dueDate,
              isMandatory: task.isMandatory,
              sortOrder: task.sortOrder,
              assigneeId: task.ownerRoleCode ? (ownerByRole.get(task.ownerRoleCode) ?? null) : null,
            };
          }),
        },
      },
      include: { tasks: { select: { id: true, assigneeId: true, title: true } } },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'STAFF_ONBOARDING',
      entityId: onboarding.id,
      description: `Started ${data.type.toLowerCase()} for ${staff.firstName} ${staff.lastName} with ${templateTasks.length} task(s)`,
    });

    // Tell each assignee once, not once per task.
    const assignees = Array.from(
      new Set(onboarding.tasks.map((t) => t.assigneeId).filter((id): id is string => Boolean(id)))
    );
    for (const assigneeId of assignees) {
      const count = onboarding.tasks.filter((t) => t.assigneeId === assigneeId).length;
      await createNotification({
        userId: assigneeId,
        type: 'TASK_ASSIGNED',
        title: `${count} ${data.type.toLowerCase()} task(s) assigned`,
        message: `You have ${count} task(s) for ${staff.firstName} ${staff.lastName}'s ${data.type.toLowerCase()}.`,
        entityType: 'STAFF_ONBOARDING',
        entityId: onboarding.id,
        actionUrl: `/hr/onboarding/${onboarding.id}`,
      });
    }

    return {
      success: true,
      message: `${data.type === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'} started for ${staff.firstName} ${staff.lastName}`,
      data: { id: onboarding.id },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateOnboardingTask(
  taskId: string,
  data: {
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED';
    notes?: string;
    assigneeId?: string;
  }
): Promise<ActionResult> {
  try {
    const { user } = await getSession();

    const task = await prisma.onboardingTask.findUnique({
      where: { id: taskId },
      include: {
        onboarding: {
          select: {
            id: true,
            staffId: true,
            type: true,
            status: true,
            staff: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!task) return { success: false, error: 'Task not found' };

    // The assignee may act on their own task; otherwise HR rights are needed.
    if (task.assigneeId !== user.id) {
      await requirePermission('HR:STAFF_UPDATE');
    }

    if (task.onboarding.status === 'COMPLETED') {
      return { success: false, error: 'This checklist is already complete' };
    }
    if (task.onboarding.status === 'CANCELLED') {
      return { success: false, error: 'This checklist was cancelled' };
    }
    if (data.status === 'SKIPPED' && task.isMandatory) {
      return { success: false, error: 'A mandatory task cannot be skipped' };
    }
    if (data.status === 'BLOCKED' && !data.notes?.trim()) {
      return { success: false, error: 'Explain what is blocking the task' };
    }

    const updates: Record<string, unknown> = {};
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === 'COMPLETED') {
        updates.completedAt = new Date();
        updates.completedById = user.id;
      } else {
        updates.completedAt = null;
        updates.completedById = null;
      }
    }
    if (data.notes !== undefined) updates.notes = data.notes.trim() || null;
    if (data.assigneeId !== undefined) updates.assigneeId = data.assigneeId || null;

    await prisma.onboardingTask.update({ where: { id: taskId }, data: updates });

    // Close the checklist automatically once every task is resolved.
    const remaining = await prisma.onboardingTask.count({
      where: {
        onboardingId: task.onboarding.id,
        status: { notIn: ['COMPLETED', 'SKIPPED'] },
      },
    });

    if (remaining === 0) {
      await prisma.staffOnboarding.update({
        where: { id: task.onboarding.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'ONBOARDING_TASK',
      entityId: taskId,
      description: `${data.status ?? 'Updated'} "${task.title}" for ${task.onboarding.staff.firstName} ${task.onboarding.staff.lastName}`,
    });

    return {
      success: true,
      message: remaining === 0 ? 'Task updated — checklist complete' : 'Task updated',
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// STAFF MOVEMENTS
// ============================================================================

export async function getStaffMovements(filters?: { staffId?: string; type?: string }) {
  await requireAnyPermission(['HR:STAFF_READ', 'HR:STAFF_UPDATE']);

  const where: Record<string, unknown> = {};
  if (filters?.staffId) where.staffId = filters.staffId;
  if (filters?.type && filters.type !== 'ALL') where.type = filters.type;

  const movements = await prisma.staffMovement.findMany({
    where,
    orderBy: { effectiveDate: 'desc' },
    take: 200,
    include: {
      staff: { select: { employeeId: true, firstName: true, lastName: true } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });

  // Resolve the role/department/branch/grade names referenced by each movement.
  const roleIds = new Set<string>();
  const deptIds = new Set<string>();
  const branchIds = new Set<string>();
  const gradeIds = new Set<string>();
  for (const m of movements) {
    [m.fromRoleId, m.toRoleId].forEach((id) => id && roleIds.add(id));
    [m.fromDepartmentId, m.toDepartmentId].forEach((id) => id && deptIds.add(id));
    [m.fromBranchId, m.toBranchId].forEach((id) => id && branchIds.add(id));
    [m.fromGradeId, m.toGradeId].forEach((id) => id && gradeIds.add(id));
  }

  const [roles, departments, branches, grades] = await Promise.all([
    prisma.role.findMany({ where: { id: { in: [...roleIds] } }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { id: { in: [...deptIds] } }, select: { id: true, name: true } }),
    prisma.branch.findMany({ where: { id: { in: [...branchIds] } }, select: { id: true, name: true } }),
    prisma.salaryGrade.findMany({ where: { id: { in: [...gradeIds] } }, select: { id: true, name: true } }),
  ]);

  const nameOf = (list: Array<{ id: string; name: string }>, id: string | null) =>
    id ? (list.find((x) => x.id === id)?.name ?? null) : null;

  return movements.map((m) => ({
    id: m.id,
    staffId: m.staffId,
    staffName: `${m.staff.firstName} ${m.staff.lastName}`,
    employeeId: m.staff.employeeId,
    type: m.type,
    effectiveDate: m.effectiveDate,
    fromRole: nameOf(roles, m.fromRoleId),
    toRole: nameOf(roles, m.toRoleId),
    fromDepartment: nameOf(departments, m.fromDepartmentId),
    toDepartment: nameOf(departments, m.toDepartmentId),
    fromBranch: nameOf(branches, m.fromBranchId),
    toBranch: nameOf(branches, m.toBranchId),
    fromGrade: nameOf(grades, m.fromGradeId),
    toGrade: nameOf(grades, m.toGradeId),
    fromSalary: m.fromSalary ? Number(m.fromSalary) : null,
    toSalary: m.toSalary ? Number(m.toSalary) : null,
    fromJobTitle: m.fromJobTitle,
    toJobTitle: m.toJobTitle,
    reason: m.reason,
    remarks: m.remarks,
    createdBy: `${m.createdBy.firstName} ${m.createdBy.lastName}`,
    createdAt: m.createdAt,
  }));
}

/**
 * Record a movement and apply it to the staff record in one transaction, so the
 * history and the live record can never disagree.
 */
export async function recordStaffMovement(data: {
  staffId: string;
  type:
    | 'PROMOTION'
    | 'DEMOTION'
    | 'TRANSFER'
    | 'CONFIRMATION'
    | 'ROLE_CHANGE'
    | 'DEPARTMENT_CHANGE'
    | 'SALARY_REVIEW'
    | 'SUSPENSION'
    | 'REINSTATEMENT'
    | 'CONTRACT_RENEWAL';
  effectiveDate: string;
  toRoleId?: string;
  toDepartmentId?: string;
  toBranchId?: string;
  toGradeId?: string;
  toJobTitle?: string;
  reason: string;
  remarks?: string;
  applyNow?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:STAFF_UPDATE');

    if (!data.reason.trim()) return { success: false, error: 'A reason is required' };

    const effectiveDate = new Date(data.effectiveDate);
    if (Number.isNaN(effectiveDate.getTime())) return { success: false, error: 'Enter a valid effective date' };
    effectiveDate.setHours(0, 0, 0, 0);

    const staff = await prisma.staff.findUnique({
      where: { id: data.staffId },
      include: {
        role: { select: { id: true, level: true, name: true } },
        compensations: { where: { isCurrent: true }, select: { basicSalary: true }, take: 1 },
      },
    });
    if (!staff || staff.isDeleted) return { success: false, error: 'Staff not found' };

    // Guard against promoting someone to authority above the actor's own.
    if (data.toRoleId) {
      const targetRole = await prisma.role.findUnique({ where: { id: data.toRoleId } });
      if (!targetRole) return { success: false, error: 'Target role not found' };
      if (!targetRole.isActive) return { success: false, error: `Role ${targetRole.name} is inactive` };
      if (targetRole.level >= user.roleLevel && user.roleCode !== 'SUPER_ADMIN') {
        return { success: false, error: 'You cannot move a staff member to a role at or above your own level' };
      }
    }
    if (data.toDepartmentId) {
      const dept = await prisma.department.findUnique({ where: { id: data.toDepartmentId } });
      if (!dept) return { success: false, error: 'Target department not found' };
      if (!dept.isActive) return { success: false, error: `Department ${dept.name} is inactive` };
    }
    if (data.toBranchId) {
      const branch = await prisma.branch.findUnique({ where: { id: data.toBranchId } });
      if (!branch) return { success: false, error: 'Target branch not found' };
      if (!branch.isActive) return { success: false, error: `Branch ${branch.name} is inactive` };
    }

    const currentSalary = staff.compensations[0] ? Number(staff.compensations[0].basicSalary) : null;

    const movement = await withTransaction(async (tx) => {
      const created = await tx.staffMovement.create({
        data: {
          staffId: data.staffId,
          type: data.type,
          effectiveDate,
          fromRoleId: staff.roleId,
          toRoleId: data.toRoleId || null,
          fromDepartmentId: staff.departmentId,
          toDepartmentId: data.toDepartmentId || null,
          fromBranchId: staff.branchId,
          toBranchId: data.toBranchId || null,
          fromGradeId: staff.gradeId,
          toGradeId: data.toGradeId || null,
          fromSalary: currentSalary,
          fromJobTitle: staff.jobTitle,
          toJobTitle: data.toJobTitle?.trim() || null,
          reason: data.reason.trim(),
          remarks: data.remarks?.trim() || null,
          createdById: user.id,
        },
      });

      // Apply immediately when the effective date has arrived.
      const shouldApply = data.applyNow !== false && effectiveDate <= new Date();
      if (shouldApply) {
        const staffUpdates: Record<string, unknown> = {};
        if (data.toRoleId) staffUpdates.roleId = data.toRoleId;
        if (data.toDepartmentId) staffUpdates.departmentId = data.toDepartmentId;
        if (data.toBranchId) staffUpdates.branchId = data.toBranchId;
        if (data.toGradeId) staffUpdates.gradeId = data.toGradeId;
        if (data.toJobTitle) staffUpdates.jobTitle = data.toJobTitle.trim();
        if (data.type === 'CONFIRMATION') staffUpdates.confirmationDate = effectiveDate;
        if (data.type === 'SUSPENSION') staffUpdates.status = 'SUSPENDED';
        if (data.type === 'REINSTATEMENT') staffUpdates.status = 'ACTIVE';

        if (Object.keys(staffUpdates).length > 0) {
          await tx.staff.update({ where: { id: data.staffId }, data: staffUpdates });
        }
      }

      return created;
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'STAFF_MOVEMENT',
      entityId: movement.id,
      description: `Recorded ${data.type} for ${staff.firstName} ${staff.lastName} effective ${effectiveDate.toISOString().slice(0, 10)}: ${data.reason.trim()}`,
      oldValues: { roleId: staff.roleId, departmentId: staff.departmentId, jobTitle: staff.jobTitle },
      newValues: {
        roleId: data.toRoleId,
        departmentId: data.toDepartmentId,
        jobTitle: data.toJobTitle,
      },
    });

    await createNotification({
      userId: data.staffId,
      type: 'INFO',
      title: `${data.type.replace('_', ' ').toLowerCase()} recorded`,
      message: `A ${data.type.replace('_', ' ').toLowerCase()} effective ${effectiveDate.toDateString()} has been recorded on your file. Reason: ${data.reason.trim()}`,
      entityType: 'STAFF_MOVEMENT',
      entityId: movement.id,
      actionUrl: '/hr/my-profile',
    });

    return {
      success: true,
      message: `${data.type.replace('_', ' ')} recorded for ${staff.firstName} ${staff.lastName}`,
      data: { id: movement.id },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// EXITS
// ============================================================================

export async function getStaffExits(filters?: { clearanceStatus?: string }) {
  await requireAnyPermission(['HR:STAFF_READ', 'HR:STAFF_UPDATE']);

  const where: Record<string, unknown> = {};
  if (filters?.clearanceStatus && filters.clearanceStatus !== 'ALL') {
    where.clearanceStatus = filters.clearanceStatus;
  }

  const exits = await prisma.staffExit.findMany({
    where,
    orderBy: { lastWorkingDay: 'desc' },
    include: {
      staff: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          hireDate: true,
          status: true,
          department: { select: { name: true } },
        },
      },
      processedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return exits.map((e) => {
    const tenureMonths = Math.round(
      (e.lastWorkingDay.getTime() - e.staff.hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    );
    return {
      id: e.id,
      staffId: e.staffId,
      staffName: `${e.staff.firstName} ${e.staff.lastName}`,
      employeeId: e.staff.employeeId,
      jobTitle: e.staff.jobTitle,
      department: e.staff.department.name,
      staffStatus: e.staff.status,
      type: e.type,
      noticeDate: e.noticeDate,
      lastWorkingDay: e.lastWorkingDay,
      reason: e.reason,
      tenureMonths,
      exitInterviewDate: e.exitInterviewDate,
      rehireEligible: e.rehireEligible,
      clearanceStatus: e.clearanceStatus,
      assetsReturned: e.assetsReturned,
      handoverCompleted: e.handoverCompleted,
      accessRevoked: e.accessRevoked,
      finalSettlementAmount: e.finalSettlementAmount ? Number(e.finalSettlementAmount) : null,
      settledAt: e.settledAt,
      processedBy: `${e.processedBy.firstName} ${e.processedBy.lastName}`,
    };
  });
}

export async function initiateStaffExit(data: {
  staffId: string;
  type: 'RESIGNATION' | 'TERMINATION' | 'RETIREMENT' | 'CONTRACT_END' | 'REDUNDANCY' | 'DEATH' | 'ABANDONMENT';
  noticeDate: string;
  lastWorkingDay: string;
  reason: string;
  detailedReason?: string;
  startOffboarding?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:STAFF_UPDATE');

    if (!data.reason.trim()) return { success: false, error: 'A reason is required' };

    const noticeDate = new Date(data.noticeDate);
    const lastWorkingDay = new Date(data.lastWorkingDay);
    if (Number.isNaN(noticeDate.getTime()) || Number.isNaN(lastWorkingDay.getTime())) {
      return { success: false, error: 'Enter valid notice and last-working-day dates' };
    }
    noticeDate.setHours(0, 0, 0, 0);
    lastWorkingDay.setHours(0, 0, 0, 0);
    if (lastWorkingDay < noticeDate) {
      return { success: false, error: 'The last working day cannot be before the notice date' };
    }

    const staff = await prisma.staff.findUnique({
      where: { id: data.staffId },
      select: { id: true, firstName: true, lastName: true, isDeleted: true, status: true },
    });
    if (!staff || staff.isDeleted) return { success: false, error: 'Staff not found' };
    if (staff.status === 'TERMINATED') return { success: false, error: 'This staff member has already left' };

    const existing = await prisma.staffExit.findUnique({ where: { staffId: data.staffId } });
    if (existing) return { success: false, error: 'An exit record already exists for this staff member' };

    const exit = await prisma.staffExit.create({
      data: {
        staffId: data.staffId,
        type: data.type,
        noticeDate,
        lastWorkingDay,
        reason: data.reason.trim(),
        detailedReason: data.detailedReason?.trim() || null,
        processedById: user.id,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'STAFF_EXIT',
      entityId: exit.id,
      description: `Initiated ${data.type} for ${staff.firstName} ${staff.lastName}, last day ${lastWorkingDay.toISOString().slice(0, 10)}`,
    });

    if (data.startOffboarding) {
      await startOffboardingForExit(data.staffId, noticeDate);
    }

    return {
      success: true,
      message: `Exit process started for ${staff.firstName} ${staff.lastName}`,
      data: { id: exit.id },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Kick off an offboarding checklist alongside an exit; failures are non-fatal. */
async function startOffboardingForExit(staffId: string, startDate: Date): Promise<void> {
  try {
    await startOnboarding({
      staffId,
      type: 'OFFBOARDING',
      startDate: startDate.toISOString().slice(0, 10),
      notes: 'Auto-created from the exit process',
    });
  } catch (error) {
    console.error('Failed to auto-start offboarding checklist:', error);
  }
}

export async function updateExitClearance(
  id: string,
  data: {
    assetsReturned?: boolean;
    handoverCompleted?: boolean;
    accessRevoked?: boolean;
    exitInterviewDate?: string;
    exitInterviewNotes?: string;
    wouldRecommend?: boolean;
    rehireEligible?: boolean;
    finalSettlementAmount?: number;
  }
): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:STAFF_UPDATE');

    const exit = await prisma.staffExit.findUnique({
      where: { id },
      include: { staff: { select: { firstName: true, lastName: true } } },
    });
    if (!exit) return { success: false, error: 'Exit record not found' };
    if (exit.clearanceStatus === 'CLEARED') {
      return { success: false, error: 'This exit has already been cleared' };
    }
    if (data.finalSettlementAmount !== undefined && data.finalSettlementAmount < 0) {
      return { success: false, error: 'The settlement amount cannot be negative' };
    }

    const updates: Record<string, unknown> = {};
    if (data.assetsReturned !== undefined) updates.assetsReturned = data.assetsReturned;
    if (data.handoverCompleted !== undefined) updates.handoverCompleted = data.handoverCompleted;
    if (data.accessRevoked !== undefined) updates.accessRevoked = data.accessRevoked;
    if (data.exitInterviewNotes !== undefined) updates.exitInterviewNotes = data.exitInterviewNotes.trim() || null;
    if (data.wouldRecommend !== undefined) updates.wouldRecommend = data.wouldRecommend;
    if (data.rehireEligible !== undefined) updates.rehireEligible = data.rehireEligible;
    if (data.finalSettlementAmount !== undefined) {
      updates.finalSettlementAmount = data.finalSettlementAmount;
      updates.settledAt = new Date();
    }
    if (data.exitInterviewDate) {
      const interviewDate = new Date(data.exitInterviewDate);
      if (Number.isNaN(interviewDate.getTime())) {
        return { success: false, error: 'Enter a valid exit interview date' };
      }
      updates.exitInterviewDate = interviewDate;
    }

    // Move the clearance state along as the checklist fills in.
    const assetsReturned = data.assetsReturned ?? exit.assetsReturned;
    const handoverCompleted = data.handoverCompleted ?? exit.handoverCompleted;
    const accessRevoked = data.accessRevoked ?? exit.accessRevoked;

    if (assetsReturned && handoverCompleted && accessRevoked) {
      updates.clearanceStatus = 'CLEARED';
    } else if (assetsReturned || handoverCompleted || accessRevoked) {
      updates.clearanceStatus = 'IN_PROGRESS';
    }

    await prisma.staffExit.update({ where: { id }, data: updates });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'STAFF_EXIT',
      entityId: id,
      description: `Updated exit clearance for ${exit.staff.firstName} ${exit.staff.lastName}`,
      changedFields: Object.keys(updates),
    });

    return {
      success: true,
      message:
        updates.clearanceStatus === 'CLEARED'
          ? 'Clearance complete — the staff record can now be finalised'
          : 'Clearance updated',
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Close out an exit: mark the staff record TERMINATED, revoke every session and
 * close the open compensation package. Requires clearance to be complete.
 */
export async function finaliseStaffExit(id: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:STAFF_UPDATE');

    const exit = await prisma.staffExit.findUnique({
      where: { id },
      include: { staff: { select: { id: true, firstName: true, lastName: true, status: true } } },
    });
    if (!exit) return { success: false, error: 'Exit record not found' };
    if (exit.clearanceStatus !== 'CLEARED') {
      return { success: false, error: 'Clearance must be complete before an exit can be finalised' };
    }
    if (exit.staff.status === 'TERMINATED') {
      return { success: false, error: 'This staff record is already closed' };
    }

    // Open items that must not be orphaned.
    const [openLoans, assignedAssets] = await Promise.all([
      prisma.leaveRequest.count({ where: { staffId: exit.staffId, status: 'PENDING' } }),
      prisma.assetAssignment.count({ where: { staffId: exit.staffId, returnedAt: null } }),
    ]);
    if (assignedAssets > 0) {
      return { success: false, error: `${assignedAssets} company asset(s) are still assigned to this staff member` };
    }

    await withTransaction(async (tx) => {
      await tx.staff.update({
        where: { id: exit.staffId },
        data: { status: 'TERMINATED', terminationDate: exit.lastWorkingDay },
      });

      await tx.userSession.updateMany({
        where: { staffId: exit.staffId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.staffCompensation.updateMany({
        where: { staffId: exit.staffId, isCurrent: true },
        data: { isCurrent: false, effectiveTo: exit.lastWorkingDay },
      });

      // Withdraw any leave still pending.
      if (openLoans > 0) {
        await tx.leaveRequest.updateMany({
          where: { staffId: exit.staffId, status: 'PENDING' },
          data: { status: 'CANCELLED', approverComments: 'Cancelled — staff exit finalised' },
        });
      }

      await tx.staffMovement.create({
        data: {
          staffId: exit.staffId,
          type: 'EXIT',
          effectiveDate: exit.lastWorkingDay,
          reason: exit.reason,
          remarks: `${exit.type} finalised`,
          createdById: user.id,
        },
      });
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'STAFF_EXIT',
      entityId: id,
      description: `Finalised ${exit.type} for ${exit.staff.firstName} ${exit.staff.lastName} — record closed, sessions revoked`,
    });

    return {
      success: true,
      message: `${exit.staff.firstName} ${exit.staff.lastName}'s exit has been finalised`,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
