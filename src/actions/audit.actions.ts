'use server';

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-utils';

export async function getAuditLogs(filters?: {
  startDate?: string;
  endDate?: string;
  module?: string;
  action?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  await requirePermission('AUDIT:READ');

  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (filters?.module) {
    where.module = filters.module;
  }
  if (filters?.action) {
    where.action = filters.action;
  }
  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters?.startDate) {
      (where.createdAt as any).gte = new Date(filters.startDate);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      (where.createdAt as any).lte = end;
    }
  }
  if (filters?.search) {
    where.OR = [
      { userEmail: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
      { entityType: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: where as any,
      include: {
        user: { select: { firstName: true, lastName: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where: where as any }),
  ]);

  return {
    data: data.map((log) => ({
      id: log.id,
      userId: log.userId,
      userEmail: log.userEmail,
      userRole: log.userRole,
      userName: log.user
        ? `${log.user.firstName} ${log.user.lastName}`
        : log.userEmail || 'System',
      employeeId: log.user?.employeeId || null,
      action: log.action,
      module: log.module,
      entityType: log.entityType,
      entityId: log.entityId,
      description: log.description,
      createdAt: log.createdAt.toISOString(),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
