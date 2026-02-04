/**
 * Hylink EMS - Verification Service
 * Field verification with photo uploads and GPS tracking
 */

import { Prisma, TaskStatus, TaskPriority, TaskType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { generateReference } from '../utils/helpers.js';
import { NotFoundError, BusinessError } from '../utils/errors.js';
import { PaginatedResult, PaginationParams } from '../types/index.js';

interface CreateVerificationTaskInput {
  taskType: TaskType;
  referenceType: string;
  referenceId: string;
  assignedToId: string;
  priority?: TaskPriority;
  dueDate?: Date;
  address: string;
  city?: string;
  instructions?: string;
}

interface SubmitVerificationInput {
  taskId: string;
  officerId: string;
  findings: string;
  recommendation: string;
  gpsCoordinates?: string;
  photos?: string[];
  attachments?: string[];
}

interface VerificationFilters {
  assignedToId?: string;
  status?: TaskStatus;
  taskType?: TaskType;
  priority?: TaskPriority;
  referenceType?: string;
}

export class VerificationService {
  /**
   * Create verification task
   */
  async createTask(input: CreateVerificationTaskInput): Promise<{ id: string }> {
    const task = await prisma.verificationTask.create({
      data: {
        taskType: input.taskType,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        assignedToId: input.assignedToId,
        priority: input.priority || TaskPriority.NORMAL,
        dueDate: input.dueDate,
        address: input.address,
        city: input.city,
        instructions: input.instructions,
        status: TaskStatus.ASSIGNED,
      },
    });

    logger.info('Verification task created', { taskId: task.id, taskType: input.taskType });

    return { id: task.id };
  }

  /**
   * Get tasks for officer (queue)
   */
  async getTaskQueue(
    filters: VerificationFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<any>> {
    const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.VerificationTaskWhereInput = {};

    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.status) where.status = filters.status;
    if (filters.taskType) where.taskType = filters.taskType;
    if (filters.priority) where.priority = filters.priority;
    if (filters.referenceType) where.referenceType = filters.referenceType;

    const [tasks, total] = await Promise.all([
      prisma.verificationTask.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { priority: 'desc' },
          { [sortBy]: sortOrder },
        ],
        include: {
          assignedTo: { select: { firstName: true, lastName: true, employeeId: true } },
        },
      }),
      prisma.verificationTask.count({ where }),
    ]);

    return {
      data: tasks,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get task by ID
   */
  async getTaskById(taskId: string): Promise<any> {
    const task = await prisma.verificationTask.findUnique({
      where: { id: taskId },
      include: {
        assignedTo: { select: { firstName: true, lastName: true, employeeId: true, phone: true } },
      },
    });

    if (!task) {
      throw new NotFoundError('Verification task not found');
    }

    return task;
  }

  /**
   * Start verification (mark as in progress)
   */
  async startVerification(taskId: string, officerId: string): Promise<void> {
    const task = await prisma.verificationTask.findUnique({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    if (task.assignedToId !== officerId) {
      throw new BusinessError('Task is not assigned to you');
    }

    if (task.status !== TaskStatus.ASSIGNED) {
      throw new BusinessError('Task is not in assigned status');
    }

    await prisma.verificationTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.IN_PROGRESS,
        startedAt: new Date(),
        visitAttempts: { increment: 1 },
      },
    });

    logger.info('Verification started', { taskId, officerId });
  }

  /**
   * Submit verification report
   */
  async submitVerification(input: SubmitVerificationInput): Promise<void> {
    const task = await prisma.verificationTask.findUnique({ where: { id: input.taskId } });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    if (task.assignedToId !== input.officerId) {
      throw new BusinessError('Task is not assigned to you');
    }

    if (task.status === TaskStatus.COMPLETED) {
      throw new BusinessError('Task is already completed');
    }

    await prisma.verificationTask.update({
      where: { id: input.taskId },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        findings: input.findings,
        recommendation: input.recommendation,
        gpsCoordinates: input.gpsCoordinates,
        photos: input.photos || [],
        attachments: input.attachments || [],
      },
    });

    logger.info('Verification submitted', { taskId: input.taskId, officerId: input.officerId });
  }

  /**
   * Reassign task
   */
  async reassignTask(taskId: string, newAssigneeId: string, reason: string): Promise<void> {
    const task = await prisma.verificationTask.findUnique({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    if (task.status === TaskStatus.COMPLETED) {
      throw new BusinessError('Cannot reassign completed task');
    }

    await prisma.verificationTask.update({
      where: { id: taskId },
      data: {
        assignedToId: newAssigneeId,
        status: TaskStatus.ASSIGNED,
        instructions: task.instructions ? `${task.instructions}\n\nReassigned: ${reason}` : `Reassigned: ${reason}`,
      },
    });

    logger.info('Task reassigned', { taskId, newAssigneeId, reason });
  }

  /**
   * Cancel task
   */
  async cancelTask(taskId: string, reason: string): Promise<void> {
    await prisma.verificationTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.CANCELLED,
        instructions: `Cancelled: ${reason}`,
      },
    });

    logger.info('Task cancelled', { taskId, reason });
  }

  /**
   * Get verification stats
   */
  async getStats(officerId?: string): Promise<{
    totalTasks: number;
    pendingTasks: number;
    inProgressTasks: number;
    completedToday: number;
    averageCompletionTime: number;
  }> {
    const where: Prisma.VerificationTaskWhereInput = {};
    if (officerId) where.assignedToId = officerId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, pending, inProgress, completedToday] = await Promise.all([
      prisma.verificationTask.count({ where }),
      prisma.verificationTask.count({ where: { ...where, status: TaskStatus.ASSIGNED } }),
      prisma.verificationTask.count({ where: { ...where, status: TaskStatus.IN_PROGRESS } }),
      prisma.verificationTask.count({
        where: { ...where, status: TaskStatus.COMPLETED, completedAt: { gte: today } },
      }),
    ]);

    // Calculate average completion time
    const completedTasks = await prisma.verificationTask.findMany({
      where: { ...where, status: TaskStatus.COMPLETED, startedAt: { not: null }, completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
      take: 100,
    });

    let avgTime = 0;
    if (completedTasks.length > 0) {
      const totalTime = completedTasks.reduce((sum, t) => {
        if (t.startedAt && t.completedAt) {
          return sum + (t.completedAt.getTime() - t.startedAt.getTime());
        }
        return sum;
      }, 0);
      avgTime = totalTime / completedTasks.length / (1000 * 60 * 60); // Hours
    }

    return {
      totalTasks: total,
      pendingTasks: pending,
      inProgressTasks: inProgress,
      completedToday,
      averageCompletionTime: Math.round(avgTime * 10) / 10,
    };
  }
}

export const verificationService = new VerificationService();
