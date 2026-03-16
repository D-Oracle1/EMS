'use server';

import { prisma } from './prisma';

interface RecordApprovalHistoryParams {
  entityType: string;
  entityId: string;
  workflowStep: string;
  stepOrder: number;
  action: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'ESCALATED' | 'RECALLED';
  actorId: string;
  actorRole: string;
  comments?: string;
  conditions?: string;
  previousStatus?: string;
  newStatus: string;
}

/**
 * Record an entry in the ApprovalHistory table for audit trail.
 * Every status transition in the loan workflow should create a record.
 */
export async function recordApprovalHistory(params: RecordApprovalHistoryParams) {
  await prisma.approvalHistory.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      workflowStep: params.workflowStep,
      stepOrder: params.stepOrder,
      action: params.action,
      actorId: params.actorId,
      actorRole: params.actorRole,
      comments: params.comments,
      conditions: params.conditions,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
    },
  });
}
