/**
 * Hylink EMS - Notification Service
 * In-app notifications and email/SMS integration
 */

import { Prisma, NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
}

interface NotificationFilters {
  userId: string;
  isRead?: boolean;
  type?: NotificationType;
}

export class NotificationService {
  async create(input: CreateNotificationInput): Promise<{ id: string }> {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType,
        entityId: input.entityId,
        actionUrl: input.actionUrl,
      },
    });
    logger.info('Notification created', { userId: input.userId, type: input.type });
    return { id: notification.id };
  }

  async createBulk(userIds: string[], notification: Omit<CreateNotificationInput, 'userId'>): Promise<number> {
    const result = await prisma.notification.createMany({
      data: userIds.map(userId => ({ userId, ...notification })),
    });
    logger.info('Bulk notifications created', { count: result.count, type: notification.type });
    return result.count;
  }

  async getNotifications(filters: NotificationFilters, limit: number = 50): Promise<any[]> {
    const where: Prisma.NotificationWhereInput = { userId: filters.userId };
    if (filters.isRead !== undefined) where.isRead = filters.isRead;
    if (filters.type) where.type = filters.type;
    return prisma.notification.findMany({ where, take: limit, orderBy: { createdAt: 'desc' } });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }

  async notifyLoanApprovalRequired(loanId: string, loanNumber: string, amount: number): Promise<void> {
    const approvers = await prisma.staff.findMany({
      where: { status: 'ACTIVE', role: { approvalLimit: { gte: amount } } },
      select: { id: true },
    });
    if (approvers.length > 0) {
      await this.createBulk(approvers.map(a => a.id), {
        type: NotificationType.APPROVAL_REQUIRED,
        title: 'Loan Approval Required',
        message: 'Loan ' + loanNumber + ' requires your approval',
        entityType: 'LOAN',
        entityId: loanId,
        actionUrl: '/loans/' + loanId,
      });
    }
  }

  async notifyTaskAssigned(taskId: string, assigneeId: string, taskType: string): Promise<void> {
    await this.create({
      userId: assigneeId,
      type: NotificationType.TASK_ASSIGNED,
      title: 'New Verification Task',
      message: 'You have been assigned a ' + taskType.replace(/_/g, ' ') + ' task',
      entityType: 'VERIFICATION_TASK',
      entityId: taskId,
      actionUrl: '/verification/' + taskId,
    });
  }

  async notifyLoanOverdue(loanId: string, loanNumber: string, daysOverdue: number): Promise<void> {
    const loan = await prisma.loan.findUnique({ where: { id: loanId }, select: { createdById: true } });
    if (loan) {
      await this.create({
        userId: loan.createdById,
        type: NotificationType.LOAN_OVERDUE,
        title: 'Loan Overdue',
        message: 'Loan ' + loanNumber + ' is ' + daysOverdue + ' days overdue',
        entityType: 'LOAN',
        entityId: loanId,
        actionUrl: '/loans/' + loanId,
      });
    }
  }

  async notifyFDMaturity(fdId: string, certificateNumber: string, maturityDate: Date): Promise<void> {
    const officers = await prisma.staff.findMany({
      where: { status: 'ACTIVE', role: { code: 'FD_OFFICER' } },
      select: { id: true },
    });
    if (officers.length > 0) {
      await this.createBulk(officers.map(o => o.id), {
        type: NotificationType.MATURITY_REMINDER,
        title: 'Fixed Deposit Maturing',
        message: 'FD ' + certificateNumber + ' is maturing on ' + maturityDate.toLocaleDateString(),
        entityType: 'FIXED_DEPOSIT',
        entityId: fdId,
        actionUrl: '/fixed-deposits/' + fdId,
      });
    }
  }

  async notifyPaymentReceived(loanId: string, loanNumber: string, amount: number, collectorId: string): Promise<void> {
    const loan = await prisma.loan.findUnique({ where: { id: loanId }, select: { createdById: true } });
    if (loan && loan.createdById !== collectorId) {
      await this.create({
        userId: loan.createdById,
        type: NotificationType.PAYMENT_RECEIVED,
        title: 'Payment Received',
        message: 'Payment of ' + amount.toLocaleString() + ' received for loan ' + loanNumber,
        entityType: 'LOAN',
        entityId: loanId,
        actionUrl: '/loans/' + loanId,
      });
    }
  }
}

export const notificationService = new NotificationService();
