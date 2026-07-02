import { prisma } from '@/lib/prisma';
import type { NotificationType } from '@prisma/client';
import { sendEmail, renderAlertEmail } from '@/lib/email';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  /** Also send an email alert (default true). Set false for low-priority pings. */
  email?: boolean;
}

/**
 * Send an email alert for a notification to the given staff users. Best-effort:
 * failures are logged and never interrupt the in-app notification.
 */
async function emailAlert(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId' | 'email'>
): Promise<void> {
  try {
    const staff = await prisma.staff.findMany({
      where: { id: { in: userIds }, status: 'ACTIVE' },
      select: { email: true, firstName: true },
    });
    const recipients = staff.filter((s) => s.email);
    if (recipients.length === 0) return;

    await Promise.allSettled(
      recipients.map((s) =>
        sendEmail({
          to: s.email as string,
          subject: params.title,
          html: renderAlertEmail({
            title: params.title,
            message: params.message,
            recipientName: s.firstName,
            actionUrl: params.actionUrl,
            actionLabel: 'Open in Hylink EMS',
          }),
          text: params.message,
        })
      )
    );
  } catch (error) {
    console.error('Failed to send email alerts:', error);
  }
}

/**
 * Create a notification for a single user (in-app + email alert).
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        entityType: params.entityType,
        entityId: params.entityId,
        actionUrl: params.actionUrl,
      },
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }

  if (params.email !== false) {
    await emailAlert([params.userId], params);
  }
}

/**
 * Create a notification for multiple users (in-app + email alerts).
 */
export async function createNotificationForUsers(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: params.type,
        title: params.title,
        message: params.message,
        entityType: params.entityType,
        entityId: params.entityId,
        actionUrl: params.actionUrl,
      })),
    });
  } catch (error) {
    console.error('Failed to create notifications:', error);
  }

  if (params.email !== false) {
    await emailAlert(userIds, params);
  }
}

/**
 * Find all active staff who have a specific permission (for broadcasting notifications)
 */
export async function getUsersWithPermission(permissionCode: string): Promise<string[]> {
  const result = await prisma.staff.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      role: {
        permissions: {
          some: {
            permission: { code: permissionCode },
          },
        },
      },
    },
    select: { id: true },
  });
  return result.map((s) => s.id);
}

/**
 * Find all active staff who have any of the specified permissions
 */
export async function getUsersWithAnyPermission(permissionCodes: string[]): Promise<string[]> {
  const result = await prisma.staff.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      role: {
        permissions: {
          some: {
            permission: { code: { in: permissionCodes } },
          },
        },
      },
    },
    select: { id: true },
  });
  return result.map((s) => s.id);
}
