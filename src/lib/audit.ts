import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type { AuditAction } from '@prisma/client';

interface AuditLogParams {
  userId: string;
  userEmail?: string;
  userRole?: string;
  action: AuditAction;
  module: string;
  entityType: string;
  entityId?: string;
  description: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Create an audit log entry
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        userEmail: params.userEmail,
        userRole: params.userRole,
        action: params.action,
        module: params.module,
        entityType: params.entityType,
        entityId: params.entityId,
        description: params.description,
        oldValues: params.oldValues ? (params.oldValues as Prisma.InputJsonValue) : Prisma.JsonNull,
        newValues: params.newValues ? (params.newValues as Prisma.InputJsonValue) : Prisma.JsonNull,
        changedFields: params.changedFields ?? [],
        metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch (error) {
    // Audit logging should never break the main operation
    console.error('Failed to create audit log:', error);
  }
}
