'use server';

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';

export async function getNotifications(limit = 20) {
  const { user } = await getSession();

  return prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getUnreadCount() {
  const { user } = await getSession();

  return prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });
}

export async function markAsRead(notificationId: string) {
  const { user } = await getSession();

  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function markAllAsRead() {
  const { user } = await getSession();

  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
