import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { AuthenticatedRequest, AuditContext } from '../types/index.js';

export async function createAuditLog(
  action: string,
  module: string,
  entityType: string,
  entityId: string | undefined,
  description: string,
  context: AuditContext,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: context.userId,
        userEmail: context.userEmail,
        userRole: context.userRole,
        action: action as any,
        module,
        entityType,
        entityId,
        description,
        oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : undefined,
        newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : undefined,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        sessionId: context.sessionId,
      },
    });
  } catch (error) {
    logger.error('Failed to create audit log', { error, action, module, entityType });
  }
}

export async function auditEntityChange(
  req: AuthenticatedRequest,
  action: string,
  module: string,
  entityType: string,
  entityId: string,
  description: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  const context: AuditContext = {
    userId: req.user.id,
    userEmail: req.user.email,
    userRole: req.user.roleCode,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    sessionId: req.sessionId,
  };
  await createAuditLog(action, module, entityType, entityId, description, context, oldValues, newValues);
}

export async function auditLogin(
  email: string,
  success: boolean,
  userId?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        userEmail: email,
        action: success ? 'LOGIN' : 'LOGIN_FAILED',
        module: 'AUTH',
        entityType: 'Session',
        description: success ? 'User logged in' : 'Failed login attempt',
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    logger.error('Failed to audit login', { error, email, success });
  }
}

export async function auditApproval(
  req: AuthenticatedRequest,
  entityType: string,
  entityId: string,
  decision: string,
  comments?: string
): Promise<void> {
  await auditEntityChange(req, 'APPROVE', 'APPROVALS', entityType, entityId, decision + ': ' + (comments || 'No comments'));
}

export async function auditFinancialTransaction(
  req: AuthenticatedRequest,
  transactionType: string,
  details: { amount: number; reference: string; description: string }
): Promise<void> {
  await auditEntityChange(req, 'CREATE', 'FINANCE', transactionType, details.reference, transactionType + ': ' + details.description + ' - Amount: ' + details.amount);
}

export async function auditExport(
  req: AuthenticatedRequest,
  reportType: string,
  params: Record<string, unknown>,
  recordCount: number
): Promise<void> {
  await auditEntityChange(req, 'EXPORT', 'REPORTS', reportType, '', 'Exported ' + reportType + ' report with ' + recordCount + ' records', undefined, params);
}
