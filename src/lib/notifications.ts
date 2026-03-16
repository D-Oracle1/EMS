import { prisma } from '@/lib/prisma';
import type { NotificationType } from '@prisma/client';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
}

/**
 * Create a notification for a single user
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
}

/**
 * Create a notification for multiple users
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
