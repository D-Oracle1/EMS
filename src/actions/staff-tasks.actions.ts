'use server';

/**
 * Staff Tasks — Server Actions
 * Hylink Finance Limited EMS
 *
 * HR assigns a task to a staff member with a deadline; the staff member reports
 * it complete themselves. Two rules shape the permissions here:
 *
 *  - Assigning, editing and cancelling belong to HR (HR:STAFF_UPDATE). The same
 *    permission already gates the onboarding console, so anyone who can run a
 *    staff member's checklist can set them a task.
 *  - Completing belongs to the person the task was given to. HR may also close
 *    one out, but nobody else can touch another person's task — a staff member
 *    only ever sees and completes their own.
 */

import { prisma } from '@/lib/prisma';
import { getSession, requirePermission, hasPermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import type { ActionResult } from '@/types';

const MANAGE_PERMISSION = 'HR:STAFF_UPDATE';

export type StaffTaskStatusValue = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type StaffTaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface StaffTaskView {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: StaffTaskPriority;
  status: StaffTaskStatusValue;
  /** ISO dates; the span between them is the task's duration. */
  startDate: string;
  dueDate: string;
  completedAt: string | null;
  completionNote: string | null;
  assignee: { id: string; name: string; employeeId: string } | null;
  assignedBy: { id: string; name: string } | null;
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: StaffTaskPriority;
  status: StaffTaskStatusValue;
  startDate: Date;
  dueDate: Date;
  completedAt: Date | null;
  completionNote: string | null;
  assignee: { id: string; firstName: string; lastName: string; employeeId: string } | null;
  assignedBy: { id: string; firstName: string; lastName: string } | null;
};

const TASK_INCLUDE = {
  assignee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
  assignedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

function toView(task: TaskRow): StaffTaskView {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    category: task.category,
    priority: task.priority,
    status: task.status,
    startDate: task.startDate.toISOString(),
    dueDate: task.dueDate.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    completionNote: task.completionNote,
    assignee: task.assignee
      ? {
          id: task.assignee.id,
          name: `${task.assignee.firstName} ${task.assignee.lastName}`,
          employeeId: task.assignee.employeeId,
        }
      : null,
    assignedBy: task.assignedBy
      ? { id: task.assignedBy.id, name: `${task.assignedBy.firstName} ${task.assignedBy.lastName}` }
      : null,
  };
}

/** Midnight-to-midnight, so a task due "today" stays due until the day is out. */
function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

// ============================================================================
// HR SIDE
// ============================================================================

export async function assignStaffTask(input: {
  assigneeId: string;
  title: string;
  description?: string;
  category?: string;
  priority?: StaffTaskPriority;
  startDate?: string;
  dueDate: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await requirePermission(MANAGE_PERMISSION);

  const title = input.title?.trim();
  if (!title) return { success: false, error: 'Give the task a title.' };
  if (!input.assigneeId) return { success: false, error: 'Choose who the task is for.' };
  if (!input.dueDate) return { success: false, error: 'Set a deadline.' };

  const startDate = input.startDate ? new Date(input.startDate) : new Date();
  const dueDate = endOfDay(input.dueDate);
  if (Number.isNaN(dueDate.getTime())) return { success: false, error: 'That deadline is not a valid date.' };
  if (dueDate < startDate) {
    return { success: false, error: 'The deadline falls before the start date.' };
  }

  const assignee = await prisma.staff.findFirst({
    where: { id: input.assigneeId, isDeleted: false, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!assignee) return { success: false, error: 'That staff member is not active.' };

  const task = await prisma.staffTask.create({
    data: {
      title,
      description: input.description?.trim() || null,
      category: input.category?.trim() || 'GENERAL',
      priority: input.priority ?? 'NORMAL',
      startDate,
      dueDate,
      assigneeId: assignee.id,
      assignedById: user.id,
    },
    select: { id: true },
  });

  await createNotification({
    userId: assignee.id,
    type: 'TASK_ASSIGNED',
    title: 'New task assigned',
    message: `${title} — due ${dueDate.toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`,
    entityType: 'StaffTask',
    entityId: task.id,
    actionUrl: '/dashboard',
  });

  await auditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'CREATE',
    module: 'HR',
    entityType: 'StaffTask',
    entityId: task.id,
    description: `Assigned task "${title}" to ${assignee.firstName} ${assignee.lastName}`,
    newValues: { title, dueDate: dueDate.toISOString(), assigneeId: assignee.id },
  });

  return { success: true, message: 'Task assigned.', data: { id: task.id } };
}

/** Every task HR has handed out, newest deadline first. */
export async function listStaffTasks(filters?: {
  assigneeId?: string;
  status?: StaffTaskStatusValue;
}): Promise<StaffTaskView[]> {
  await requirePermission(MANAGE_PERMISSION);

  const tasks = await prisma.staffTask.findMany({
    where: {
      ...(filters?.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: TASK_INCLUDE,
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    take: 200,
  });

  return tasks.map((task) => toView(task as TaskRow));
}

export async function cancelStaffTask(id: string): Promise<ActionResult> {
  const user = await requirePermission(MANAGE_PERMISSION);

  const task = await prisma.staffTask.findUnique({ where: { id }, select: { id: true, title: true, status: true } });
  if (!task) return { success: false, error: 'That task no longer exists.' };
  if (task.status === 'COMPLETED') return { success: false, error: 'That task is already complete.' };

  await prisma.staffTask.update({ where: { id }, data: { status: 'CANCELLED' } });

  await auditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'UPDATE',
    module: 'HR',
    entityType: 'StaffTask',
    entityId: id,
    description: `Cancelled task "${task.title}"`,
  });

  return { success: true, message: 'Task cancelled.' };
}

// ============================================================================
// STAFF SIDE
// ============================================================================

/** The signed-in user's own tasks. Open ones first, then the recently closed. */
export async function getMyTasks(): Promise<StaffTaskView[]> {
  const { user } = await getSession();

  const tasks = await prisma.staffTask.findMany({
    where: { assigneeId: user.id, status: { not: 'CANCELLED' } },
    include: TASK_INCLUDE,
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    take: 50,
  });

  return tasks.map((task) => toView(task as TaskRow));
}

/**
 * Report a task done. Only the person it was given to may do this — or HR,
 * closing one out on their behalf.
 */
export async function completeStaffTask(id: string, note?: string): Promise<ActionResult> {
  const { user } = await getSession();

  const task = await prisma.staffTask.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, assigneeId: true, assignedById: true },
  });
  if (!task) return { success: false, error: 'That task no longer exists.' };

  const isOwner = task.assigneeId === user.id;
  if (!isOwner && !hasPermission(user, MANAGE_PERMISSION)) {
    return { success: false, error: 'That task belongs to someone else.' };
  }
  if (task.status === 'COMPLETED') return { success: false, error: 'That task is already complete.' };
  if (task.status === 'CANCELLED') return { success: false, error: 'That task was cancelled.' };

  await prisma.staffTask.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completionNote: note?.trim() || null,
    },
  });

  // Tell whoever set it, so HR does not have to go looking.
  if (task.assignedById && task.assignedById !== user.id) {
    await createNotification({
      userId: task.assignedById,
      type: 'INFO',
      title: 'Task completed',
      message: `${user.firstName} ${user.lastName} completed "${task.title}"`,
      entityType: 'StaffTask',
      entityId: task.id,
      actionUrl: '/hr/tasks',
      email: false,
    });
  }

  await auditLog({
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    action: 'UPDATE',
    module: 'HR',
    entityType: 'StaffTask',
    entityId: id,
    description: `Completed task "${task.title}"`,
  });

  return { success: true, message: 'Task marked complete.' };
}

/** Move a task to in-progress, so a long job does not sit looking untouched. */
export async function startStaffTask(id: string): Promise<ActionResult> {
  const { user } = await getSession();

  const task = await prisma.staffTask.findUnique({
    where: { id },
    select: { id: true, status: true, assigneeId: true },
  });
  if (!task) return { success: false, error: 'That task no longer exists.' };
  if (task.assigneeId !== user.id) return { success: false, error: 'That task belongs to someone else.' };
  if (task.status !== 'PENDING') return { success: false, error: 'That task is already under way.' };

  await prisma.staffTask.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
  return { success: true, message: 'Marked as in progress.' };
}
