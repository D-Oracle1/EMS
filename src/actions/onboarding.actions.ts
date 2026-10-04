'use server';

/**
 * Staff onboarding review — Server Actions
 * Hylink Finance Limited EMS
 *
 * New joiners fill the public staff onboarding form (form.actions
 * createOnboardingForm). Each response waits here as PENDING. HR sets the
 * department, role and branch — never the respondent — corrects any typo,
 * and approves: that creates the staff member (lib/staff-create), emails
 * their login, and links the response to the new record. Approving many at
 * once is the point: no more creating staff one after another.
 *
 * Who: anyone holding HR:STAFF_CREATE, the same as the New Staff dialog.
 */

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createStaffRecord, emailStaffLogin } from '@/lib/staff-create';
import { staffInputProblems, type StaffInput } from '@/lib/staff-input';
import { onboardingDetails, isOnboardingField, readQuestions, answerText, readFiles, type Answers, type FileAnswer } from '@/lib/forms';
import type { ActionResult } from '@/types';
import type { IssuedLogin } from '@/actions/auth.actions';

const fullName = (s?: { firstName: string; lastName: string } | null) => (s ? `${s.firstName} ${s.lastName}` : null);

export async function getOnboardingOptions() {
  await requirePermission('HR:STAFF_CREATE');
  const [departments, roles, branches] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.role.findMany({ where: { isActive: true }, select: { id: true, name: true, level: true }, orderBy: { level: 'asc' } }),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return { departments, roles, branches };
}

export type OnboardingRequest = Awaited<ReturnType<typeof getOnboardingRequests>>[number];

/** Requests in one state: every pending one, or the latest 100 decided. */
export async function getOnboardingRequests(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING') {
  await requirePermission('HR:STAFF_CREATE');
  const rows = await prisma.formResponse.findMany({
    where: { onboardingStatus: status },
    orderBy: { submittedAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: status === 'PENDING' ? 500 : 100,
    include: {
      form: { select: { title: true, questions: true } },
      onboardedStaff: { select: { employeeId: true, firstName: true, lastName: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
    },
  });

  // Flag anyone whose email is already a staff account, so HR sees it before approving.
  const emails = rows.map((r) => onboardingDetails((r.answers ?? {}) as Answers).email).filter(Boolean);
  const taken = new Set(
    (await prisma.staff.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((s) => s.email.toLowerCase())
  );

  return rows.map((r) => {
    const answers = (r.answers ?? {}) as Answers;
    const details = onboardingDetails(answers);
    // HR's own questions (position, branch, a passport photo...), shown alongside.
    const extras = readQuestions(r.form.questions)
      .filter((q) => !isOnboardingField(q.id) && answers[q.id] != null)
      .map((q) => {
        const files = q.type === 'FILE' ? readFiles(answers[q.id]) : null;
        return { label: q.label, text: files ? '' : answerText(answers[q.id]), files: (files ?? []) as FileAnswer[] };
      })
      .filter((x) => x.text || x.files.length);
    return {
      id: r.id,
      formTitle: r.form.title,
      submittedAt: r.submittedAt.toISOString(),
      details,
      extras,
      emailTaken: status === 'PENDING' && !!details.email && taken.has(details.email),
      staff: r.onboardedStaff ? { employeeId: r.onboardedStaff.employeeId, name: fullName(r.onboardedStaff) } : null,
      reviewedBy: fullName(r.reviewedBy),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewNote: r.reviewNote,
    };
  });
}

export async function getPendingOnboardingCount(): Promise<number> {
  await requirePermission('HR:STAFF_CREATE');
  return prisma.formResponse.count({ where: { onboardingStatus: 'PENDING' } });
}

export interface ApprovalItem {
  responseId: string;
  /** The details as HR left them: the response's answers, typos corrected. */
  details: Omit<StaffInput, 'departmentId' | 'roleId' | 'branchId' | 'supervisorId'>;
  departmentId: string;
  roleId: string;
  branchId?: string;
}

export interface ApprovalResult {
  created: (IssuedLogin & { emailed: boolean; responseId: string })[];
  failed: { responseId: string; name: string; error: string }[];
}

/** Creates a staff member from each request and emails their login. */
export async function approveOnboarding(items: ApprovalItem[], options: { sendEmails: boolean }): Promise<ActionResult<ApprovalResult>> {
  try {
    const user = await requirePermission('HR:STAFF_CREATE');
    if (!Array.isArray(items) || items.length === 0) return { success: false, error: 'Select at least one request' };
    if (items.length > 100) return { success: false, error: 'Approve at most 100 at a time' };

    const [roles, branches] = await Promise.all([
      prisma.role.findMany({ select: { id: true, name: true } }),
      prisma.branch.findMany({ select: { id: true, name: true } }),
    ]);

    const created: ApprovalResult['created'] = [];
    const failed: ApprovalResult['failed'] = [];

    for (const item of items) {
      const input: StaffInput = { ...item.details, departmentId: item.departmentId, roleId: item.roleId, branchId: item.branchId || undefined };
      const name = `${item.details.firstName ?? ''} ${item.details.lastName ?? ''}`.trim() || 'Unnamed';
      const problems = staffInputProblems(input);
      if (problems.length) {
        failed.push({ responseId: item.responseId, name, error: problems.join('; ') });
        continue;
      }

      // Claim the request first, so two people approving at once cannot make two accounts.
      const claim = await prisma.formResponse.updateMany({
        where: { id: item.responseId, onboardingStatus: 'PENDING' },
        data: { onboardingStatus: 'APPROVED', reviewedById: user.id, reviewedAt: new Date() },
      });
      if (claim.count === 0) {
        failed.push({ responseId: item.responseId, name, error: 'Already approved or rejected by someone else' });
        continue;
      }

      try {
        const made = await createStaffRecord(input, user, 'onboarding form');
        await prisma.formResponse.update({ where: { id: item.responseId }, data: { onboardedStaffId: made.staffId } });
        const emailed = options.sendEmails
          ? await emailStaffLogin({ email: input.email.trim().toLowerCase(), firstName: input.firstName.trim(), ...made })
          : false;
        created.push({
          responseId: item.responseId,
          staffId: made.staffId,
          name,
          employeeId: made.employeeId,
          email: input.email.trim().toLowerCase(),
          role: roles.find((r) => r.id === input.roleId)?.name ?? null,
          branch: branches.find((b) => b.id === input.branchId)?.name ?? null,
          tempPassword: made.tempPassword,
          emailed,
        });
      } catch (error) {
        // Nothing was created: put the request back in the queue.
        await prisma.formResponse.update({
          where: { id: item.responseId },
          data: { onboardingStatus: 'PENDING', reviewedById: null, reviewedAt: null },
        });
        failed.push({ responseId: item.responseId, name, error: error instanceof Error ? error.message : 'Could not be created' });
      }
    }

    await auditLog({
      userId: user.id, action: 'APPROVE', module: 'HR', entityType: 'STAFF_ONBOARDING',
      description: `Approved ${created.length} onboarding request(s)${failed.length ? `, ${failed.length} failed` : ''}`,
    });

    const message = `Created ${created.length} staff${failed.length ? `, ${failed.length} not created` : ''}`;
    return { success: true, message, data: { created, failed } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Approval failed' };
  }
}

/** Turns requests down with an optional note. Nothing is created. */
export async function rejectOnboarding(responseIds: string[], note?: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:STAFF_CREATE');
    if (!Array.isArray(responseIds) || responseIds.length === 0) return { success: false, error: 'Select at least one request' };
    const result = await prisma.formResponse.updateMany({
      where: { id: { in: responseIds }, onboardingStatus: 'PENDING' },
      data: {
        onboardingStatus: 'REJECTED',
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: note?.trim().slice(0, 500) || null,
      },
    });
    await auditLog({
      userId: user.id, action: 'REJECT', module: 'HR', entityType: 'STAFF_ONBOARDING',
      description: `Rejected ${result.count} onboarding request(s)${note ? `: ${note.trim().slice(0, 200)}` : ''}`,
    });
    return { success: true, message: `Rejected ${result.count} request${result.count === 1 ? '' : 's'}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not reject' };
  }
}
