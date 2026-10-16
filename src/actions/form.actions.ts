'use server';

/**
 * Forms — Server Actions
 * Hylink Finance Limited EMS
 *
 * Google-Forms-style questionnaires. Admins (lib/forms canManageForms) build a
 * form, open it, share its link and read the responses. A PUBLIC form takes
 * answers from anyone with the link, signed in or not; a STAFF form only from
 * signed-in staff, who also find it under My Forms.
 *
 * getPublicForm and submitFormResponse are PUBLIC — they run with no session
 * for a public form. They read only what the form shows, validate every
 * answer against the form's own questions (lib/forms validateAnswers), cap the
 * payload, drop honeypot submissions and refuse a sudden flood.
 *
 * Customer application forms (lib/customer-forms: savings, partnership, fixed
 * deposit, loan, guarantor) are public forms whose responses wait for the
 * product's officers under Applications (application.actions). Each applicant
 * gets a reference; a loan applicant also gets the link for their guarantors.
 */

import { Prisma, type FormPurpose } from '@prisma/client';
import { del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotificationForUsers } from '@/lib/notifications';
import { ALL_BRANCHES_ROLE_LEVEL } from '@/lib/branch-scope';
import { formatCurrency } from '@/lib/utils';
import {
  canManageForms, normalizeQuestions, readQuestions, validateAnswers, isAcceptingResponses,
  makeSlug, LIMITS, readFiles, onboardingTemplate, enforceOnboardingFields, onboardingDetails,
  type FormQuestion, type Answers,
} from '@/lib/forms';
import {
  isCustomerPurpose, enforceCustomerFields, customerFormTemplate, applicantDetails, makeReference, withGuarantorCheques,
  normalizeReference, PURPOSE_INFO, GUARANTORS_REQUIRED, CUSTOMER_FORM_DESCRIPTION, CUSTOMER_FORM_CONFIRMATION,
  applicationTerms, type CustomerPurpose,
} from '@/lib/customer-forms';
import { computeFee, DEFAULT_FEES, type FeeSetting } from '@/lib/fees';
import { findReferrer } from '@/lib/referrals';
import type { ActionResult, SessionUser } from '@/types';

const fullName = (s?: { firstName: string; lastName: string } | null) => (s ? `${s.firstName} ${s.lastName}` : null);

/** Responses accepted per form per minute before it reports itself busy. */
const FLOOD_PER_MINUTE = 60;
/** Largest answers payload accepted, in characters of JSON. */
const MAX_PAYLOAD = 100_000;

/** Every uploaded file's link in a set of responses. */
function uploadedUrls(answersList: unknown[]): string[] {
  return answersList.flatMap((answers) =>
    Object.values((answers ?? {}) as Record<string, unknown>).flatMap((v) => readFiles(v)?.map((f) => f.url) ?? [])
  );
}

/** Removes uploaded files from storage. Best effort: a failure never blocks the delete. */
async function removeUploads(urls: string[]) {
  if (urls.length === 0) return;
  try {
    await del(urls);
  } catch (error) {
    console.error('Could not remove form uploads:', error);
  }
}

async function requireManager(): Promise<SessionUser> {
  const { user } = await getSession();
  if (!canManageForms(user)) throw new Error('Permission denied');
  return user;
}

/** Any signed-in staff member: everyone may build forms of their own. */
async function requireStaffMember(): Promise<SessionUser> {
  const { user } = await getSession();
  if ((user.userType ?? 'staff') !== 'staff') throw new Error('Permission denied');
  return user;
}

/**
 * A form this staff member may manage: any form for a form manager, otherwise
 * only one they made themselves. Anyone else is told it does not exist.
 */
async function requireFormAccess(formId: string): Promise<{ user: SessionUser; manager: boolean }> {
  const user = await requireStaffMember();
  if (canManageForms(user)) return { user, manager: true };
  const form = await prisma.form.findUnique({ where: { id: formId }, select: { createdById: true } });
  if (!form || form.createdById !== user.id) throw new Error('Form not found');
  return { user, manager: false };
}

/** Kinds of form only managers make: staff onboarding, and the guarantor form every loan's guarantors are sent to. */
const MANAGER_ONLY_PURPOSES: FormPurpose[] = ['STAFF_ONBOARDING', 'GUARANTOR'];

/**
 * The branch a staff member's own customer form routes to: where they are
 * posted, or any branch for head-office staff. Undefined for a form manager,
 * who chooses.
 */
async function ownFormBranch(user: SessionUser, manager: boolean): Promise<string | null | undefined> {
  if (manager) return undefined;
  const me = await prisma.staff.findUnique({ where: { id: user.id }, select: { branchId: true } });
  return me?.branchId ?? null;
}

/** The signed-in staff member, if any. Customers on the portal are not staff. */
async function currentStaff(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id || (user.userType ?? 'staff') !== 'staff') return null;
  return user;
}

export interface FormInput {
  title: string;
  description?: string;
  audience: 'PUBLIC' | 'STAFF';
  confirmationMessage?: string;
  oneResponsePerStaff?: boolean;
  /** ISO date-time, or empty for no deadline. */
  closesAt?: string | null;
  questions: FormQuestion[];
  /** Customer application forms: the branch that receives them, or empty for any branch. */
  branchId?: string | null;
}

export async function getFormAccess() {
  const user = await currentStaff();
  return { canManage: !!user && canManageForms(user), canCreate: !!user };
}

// ─── Admin ──────────────────────────────────────────────────────────────────

/** Every form for a form manager; a staff member's own forms for anyone else. */
export async function getForms() {
  const user = await requireStaffMember();
  const forms = await prisma.form.findMany({
    where: canManageForms(user) ? {} : { createdById: user.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      _count: { select: { responses: true } },
      responses: { select: { submittedAt: true }, orderBy: { submittedAt: 'desc' }, take: 1 },
    },
  });
  return forms.map((f) => ({
    id: f.id,
    slug: f.slug,
    title: f.title,
    audience: f.audience,
    purpose: f.purpose,
    status: f.status,
    accepting: isAcceptingResponses(f),
    closesAt: f.closesAt?.toISOString() ?? null,
    questionCount: readQuestions(f.questions).length,
    responseCount: f._count.responses,
    lastResponseAt: f.responses[0]?.submittedAt.toISOString() ?? null,
    createdBy: fullName(f.createdBy),
    updatedAt: f.updatedAt.toISOString(),
  }));
}

export async function getFormForEdit(id: string) {
  let manager: boolean;
  try {
    ({ manager } = await requireFormAccess(id));
  } catch {
    return null;
  }
  const f = await prisma.form.findUnique({ where: { id }, include: { _count: { select: { responses: true } } } });
  if (!f) return null;
  // A staff member's own forms go to their own branch's officers, so only managers choose.
  const branches = isCustomerPurpose(f.purpose) && manager
    ? await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    : [];
  return {
    branchId: f.branchId,
    branches,
    id: f.id,
    slug: f.slug,
    title: f.title,
    description: f.description ?? '',
    audience: f.audience,
    purpose: f.purpose,
    status: f.status,
    confirmationMessage: f.confirmationMessage ?? '',
    oneResponsePerStaff: f.oneResponsePerStaff,
    closesAt: f.closesAt?.toISOString() ?? null,
    questions: readQuestions(f.questions),
    responseCount: f._count.responses,
  };
}

async function cleanInput(data: FormInput, purpose: FormPurpose = 'GENERAL', ownBranch?: string | null) {
  const title = (data.title ?? '').trim().slice(0, LIMITS.title);
  if (!title) throw new Error('Give the form a title');
  const onboarding = purpose === 'STAFF_ONBOARDING';
  const customer = isCustomerPurpose(purpose);
  // New joiners and customers have no staff login, so these forms are always public.
  const audience: 'STAFF' | 'PUBLIC' = !onboarding && !customer && data.audience === 'STAFF' ? 'STAFF' : 'PUBLIC';
  const questions = normalizeQuestions(data.questions);
  let closesAt: Date | null = null;
  if (data.closesAt) {
    closesAt = new Date(data.closesAt);
    if (Number.isNaN(closesAt.getTime())) throw new Error('The closing date is not a valid date');
  }
  return {
    title,
    description: (data.description ?? '').trim().slice(0, LIMITS.description) || null,
    audience,
    confirmationMessage: (data.confirmationMessage ?? '').trim().slice(0, LIMITS.confirmation) || null,
    // One response each needs to know who answered, so it means nothing on a public form.
    oneResponsePerStaff: audience === 'STAFF' && data.oneResponsePerStaff === true,
    closesAt,
    questions: (
      onboarding ? enforceOnboardingFields(questions) : customer ? enforceCustomerFields(purpose, questions) : questions
    ) as unknown as Prisma.InputJsonValue,
    ...(customer ? { branchId: ownBranch !== undefined ? ownBranch : await formBranch(data.branchId) } : {}),
  };
}

/** The branch a customer form routes to: an active one, or none. */
async function formBranch(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const branch = await prisma.branch.findFirst({ where: { id, isActive: true }, select: { id: true } });
  if (!branch) throw new Error('That branch is not available');
  return branch.id;
}

/** Creates a form (no id) or saves changes to one. New forms start as drafts. */
export async function saveForm(data: FormInput, id?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, manager } = id
      ? await requireFormAccess(id)
      : await requireStaffMember().then((u) => ({ user: u, manager: canManageForms(u) }));
    const existing = id ? await prisma.form.findUnique({ where: { id }, select: { id: true, purpose: true } }) : null;
    if (id && !existing) return { success: false, error: 'Form not found' };
    const values = await cleanInput(data, existing?.purpose, await ownFormBranch(user, manager));

    if (id) {
      await prisma.form.update({ where: { id }, data: values satisfies Prisma.FormUncheckedUpdateInput });
      await auditLog({
        userId: user.id, action: 'UPDATE', module: 'FORMS', entityType: 'FORM', entityId: id,
        description: `Edited form "${values.title}"`,
      });
      return { success: true, message: 'Form saved', data: { id } };
    }

    const form = await prisma.form.create({
      data: { ...values, slug: makeSlug(values.title), createdById: user.id, personal: !manager },
    });
    await auditLog({
      userId: user.id, action: 'CREATE', module: 'FORMS', entityType: 'FORM', entityId: form.id,
      description: `Created form "${values.title}"`,
    });
    return { success: true, message: 'Form created', data: { id: form.id } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not save the form' };
  }
}

/**
 * A ready-made staff onboarding form, as a draft to review and open. Its
 * responses wait under HR > Onboarding, where approving one creates the
 * staff member and emails their login.
 */
export async function createOnboardingForm(): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireManager();
    const title = 'Staff Onboarding: Hy-Link Finance';
    const form = await prisma.form.create({
      data: {
        title,
        slug: makeSlug('staff-onboarding'),
        description:
          'Welcome to Hy-Link Finance. Please fill in your details exactly as they appear on your ID. ' +
          'HR will review them, set up your account and email your login details.',
        audience: 'PUBLIC',
        purpose: 'STAFF_ONBOARDING',
        confirmationMessage:
          'Thank you. HR will review your details and email your login details to the address you gave.',
        questions: onboardingTemplate() as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
    await auditLog({
      userId: user.id, action: 'CREATE', module: 'FORMS', entityType: 'FORM', entityId: form.id,
      description: `Created staff onboarding form "${title}"`,
    });
    return { success: true, message: 'Onboarding form created', data: { id: form.id } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not create the form' };
  }
}

/**
 * A ready-made customer application form (savings, partnership, fixed
 * deposit, loan or guarantor), as a draft to review and open. Its responses
 * wait under Applications for the product's officers.
 */
export async function createCustomerForm(purpose: CustomerPurpose): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireStaffMember();
    const manager = canManageForms(user);
    if (!isCustomerPurpose(purpose)) return { success: false, error: 'Unknown kind of form' };
    if (!manager && MANAGER_ONLY_PURPOSES.includes(purpose)) {
      return { success: false, error: 'Only form managers can create this kind of form' };
    }
    const info = PURPOSE_INFO[purpose];
    const form = await prisma.form.create({
      data: {
        personal: !manager,
        // A staff member's own form goes to the officers of their branch.
        ...(manager ? {} : { branchId: (await ownFormBranch(user, false)) ?? null }),
        title: info.title,
        slug: makeSlug(info.title),
        description: CUSTOMER_FORM_DESCRIPTION[purpose],
        audience: 'PUBLIC',
        purpose,
        confirmationMessage: CUSTOMER_FORM_CONFIRMATION[purpose],
        questions: customerFormTemplate(purpose) as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
    await auditLog({
      userId: user.id, action: 'CREATE', module: 'FORMS', entityType: 'FORM', entityId: form.id,
      description: `Created ${info.label.toLowerCase()} application form "${info.title}"`,
    });
    return { success: true, message: `${info.title} created`, data: { id: form.id } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not create the form' };
  }
}

/**
 * The officers an application goes to: anyone holding one of its reviewer
 * permissions, in the form's branch when it has one, plus senior staff, who
 * see every branch.
 */
async function applicationReviewerIds(purpose: CustomerPurpose, branchId: string | null): Promise<string[]> {
  const rows = await prisma.staff.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      role: { permissions: { some: { permission: { code: { in: PURPOSE_INFO[purpose].reviewers } } } } },
      ...(branchId ? { OR: [{ branchId }, { role: { level: { gte: ALL_BRANCHES_ROLE_LEVEL } } }] } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Who an application through this form is credited to: the staff member whose
 * personal link it came by, else the maker of a staff member's own form.
 */
async function referrerFor(form: { personal: boolean; createdById: string }, by?: string | null) {
  const viaLink = by ? await findReferrer(by) : null;
  if (viaLink || !form.personal) return viaLink;
  return prisma.staff.findFirst({
    where: { id: form.createdById, status: 'ACTIVE', isDeleted: false },
    select: { id: true, firstName: true, lastName: true, employeeId: true },
  });
}

/** The guarantor form a loan applicant's guarantors are sent to: the newest one open. */
async function openGuarantorForm() {
  const now = new Date();
  return prisma.form.findFirst({
    where: { purpose: 'GUARANTOR', status: 'OPEN', OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    select: { slug: true },
  });
}

/** The loan application a guarantor's reference points at, unless it was turned down. */
async function guaranteeTarget(reference: string | null) {
  if (!reference) return null;
  const app = await prisma.formResponse.findUnique({
    where: { reference },
    select: {
      id: true,
      answers: true,
      onboardingStatus: true,
      form: { select: { purpose: true } },
      _count: { select: { guarantors: { where: { onboardingStatus: { not: 'REJECTED' } } } } },
    },
  });
  if (!app || app.form.purpose !== 'LOAN_APPLICATION' || app.onboardingStatus === 'REJECTED') return null;
  return app;
}

/** Everyone who can create staff: the people an onboarding request goes to. */
async function staffCreatorIds(): Promise<string[]> {
  const rows = await prisma.staff.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      role: { permissions: { some: { permission: { code: 'HR:STAFF_CREATE' } } } },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Opens, closes or returns a form to draft. Opening a staff form the first time tells every staff member. */
export async function setFormStatus(id: string, status: 'DRAFT' | 'OPEN' | 'CLOSED'): Promise<ActionResult> {
  try {
    const { user, manager } = await requireFormAccess(id);
    if (!['DRAFT', 'OPEN', 'CLOSED'].includes(status)) return { success: false, error: 'Unknown status' };
    const form = await prisma.form.findUnique({ where: { id } });
    if (!form) return { success: false, error: 'Form not found' };
    if (status === 'OPEN' && readQuestions(form.questions).length === 0) {
      return { success: false, error: 'Add at least one question before opening the form' };
    }

    const firstOpening = status === 'OPEN' && !form.publishedAt;
    await prisma.form.update({
      where: { id },
      data: {
        status,
        ...(firstOpening ? { publishedAt: new Date() } : {}),
        // Reopening a form whose deadline has passed would open nothing.
        ...(status === 'OPEN' && form.closesAt && form.closesAt <= new Date() ? { closesAt: null } : {}),
      },
    });

    // Only a form manager's staff form is announced to every staff member.
    if (firstOpening && form.audience === 'STAFF' && manager) {
      const staff = await prisma.staff.findMany({
        where: { status: 'ACTIVE', isDeleted: false, id: { not: user.id } },
        select: { id: true },
      });
      await createNotificationForUsers(staff.map((s) => s.id), {
        type: 'TASK_ASSIGNED',
        title: 'A form needs your response',
        message: `"${form.title}" is open. Please fill it in.`,
        entityType: 'FORM',
        entityId: form.id,
        actionUrl: `/f/${form.slug}`,
      });
    }

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'FORMS', entityType: 'FORM', entityId: id,
      description: `Set form "${form.title}" to ${status}`,
    });
    const word = status === 'OPEN' ? 'opened' : status === 'CLOSED' ? 'closed' : 'moved back to draft';
    return { success: true, message: `Form ${word}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not change the form' };
  }
}

export async function deleteForm(id: string): Promise<ActionResult> {
  try {
    const { user } = await requireFormAccess(id);
    const form = await prisma.form.findUnique({
      where: { id },
      include: { _count: { select: { responses: true } }, responses: { select: { answers: true } } },
    });
    if (!form) return { success: false, error: 'Form not found' };
    // Fee payments are financial records, never deleted (lib/fees).
    const paid = await prisma.feePayment.count({ where: { response: { formId: id } } });
    if (paid) return { success: false, error: `This form has ${paid} fee payment(s) recorded against it, so it cannot be deleted. Close it instead.` };
    await prisma.form.delete({ where: { id } });
    await removeUploads(uploadedUrls(form.responses.map((r) => r.answers)));
    await auditLog({
      userId: user.id, action: 'DELETE', module: 'FORMS', entityType: 'FORM', entityId: id,
      description: `Deleted form "${form.title}" and its ${form._count.responses} response(s)`,
    });
    return { success: true, message: 'Form deleted' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not delete the form' };
  }
}

/** A copy of a form's questions and settings as a new draft, with no responses. */
export async function duplicateForm(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, manager } = await requireFormAccess(id);
    const form = await prisma.form.findUnique({ where: { id } });
    if (!form) return { success: false, error: 'Form not found' };
    const title = `${form.title} (copy)`.slice(0, LIMITS.title);
    const copy = await prisma.form.create({
      data: {
        title,
        slug: makeSlug(title),
        description: form.description,
        audience: form.audience,
        confirmationMessage: form.confirmationMessage,
        oneResponsePerStaff: form.oneResponsePerStaff,
        purpose: form.purpose,
        branchId: form.branchId,
        questions: form.questions as Prisma.InputJsonValue,
        createdById: user.id,
        personal: !manager,
      },
    });
    return { success: true, message: 'Copy created', data: { id: copy.id } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not copy the form' };
  }
}

export async function getFormResponses(id: string) {
  try {
    await requireFormAccess(id);
  } catch {
    return null;
  }
  const form = await prisma.form.findUnique({
    where: { id },
    include: {
      responses: {
        orderBy: { submittedAt: 'desc' },
        include: { staff: { select: { firstName: true, lastName: true, employeeId: true, department: { select: { name: true } } } } },
      },
    },
  });
  if (!form) return null;
  return {
    id: form.id,
    slug: form.slug,
    title: form.title,
    description: form.description,
    audience: form.audience,
    purpose: form.purpose,
    status: form.status,
    accepting: isAcceptingResponses(form),
    closesAt: form.closesAt?.toISOString() ?? null,
    questions: readQuestions(form.questions),
    responses: form.responses.map((r) => ({
      id: r.id,
      onboardingStatus: r.onboardingStatus,
      submittedAt: r.submittedAt.toISOString(),
      respondent: fullName(r.staff),
      respondentDetail: r.staff ? [r.staff.employeeId, r.staff.department?.name].filter(Boolean).join(' · ') : null,
      answers: (r.answers ?? {}) as Answers,
    })),
  };
}

export async function deleteFormResponse(id: string): Promise<ActionResult> {
  try {
    const user = await requireStaffMember();
    const response = await prisma.formResponse.findUnique({ where: { id }, include: { form: { select: { title: true, createdById: true } } } });
    if (!response || (!canManageForms(user) && response.form.createdById !== user.id)) {
      return { success: false, error: 'Response not found' };
    }
    if (await prisma.feePayment.count({ where: { responseId: id } })) {
      return { success: false, error: 'A fee payment is recorded against this response, so it cannot be deleted' };
    }
    await prisma.formResponse.delete({ where: { id } });
    await removeUploads(uploadedUrls([response.answers]));
    await auditLog({
      userId: user.id, action: 'DELETE', module: 'FORMS', entityType: 'FORM_RESPONSE', entityId: id,
      description: `Deleted a response to "${response.form.title}"`,
    });
    return { success: true, message: 'Response deleted' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not delete the response' };
  }
}

// ─── Answering ──────────────────────────────────────────────────────────────

export type PublicFormState =
  | { state: 'not-found' }
  | { state: 'closed'; title: string; message?: string }
  | { state: 'login'; title: string }
  | { state: 'answered'; title: string; message: string }
  | {
      state: 'open';
      /** A manager looking at a draft: shown, but it cannot be submitted. */
      preview: boolean;
      form: {
        title: string; description: string | null; audience: 'PUBLIC' | 'STAFF'; questions: FormQuestion[];
        purpose: FormPurpose;
      };
      respondent: string | null;
      /**
       * A guarantor form opened from an applicant's link: whom they are
       * guaranteeing. Null on a guarantor form opened without one, where the
       * page asks for the application number instead.
       */
      guaranteeing: { reference: string; applicant: string; amount: string | null } | null;
      /** A customer form opened from a staff member's personal link: who shared it. */
      sharedBy: string | null;
    };

const DEFAULT_CONFIRMATION = 'Thank you. Your response has been recorded.';

/**
 * What the share link shows. PUBLIC. `app` is a loan application's reference,
 * on a guarantor's link; `by` is the referral code on a staff member's
 * personal link (lib/referrals).
 */
export async function getPublicForm(slug: string, app?: string, by?: string): Promise<PublicFormState> {
  const form = await prisma.form.findUnique({ where: { slug: String(slug).slice(0, 80) } });
  if (!form) return { state: 'not-found' };

  const staff = await currentStaff();
  const manager = !!staff && canManageForms(staff);
  const preview = form.status === 'DRAFT' && manager;

  if (form.status === 'DRAFT' && !manager) return { state: 'not-found' };
  if (!preview && !isAcceptingResponses(form)) return { state: 'closed', title: form.title };
  if (form.audience === 'STAFF' && !staff) return { state: 'login', title: form.title };

  if (!preview && staff && form.audience === 'STAFF' && form.oneResponsePerStaff) {
    const already = await prisma.formResponse.findFirst({ where: { formId: form.id, staffId: staff.id }, select: { id: true } });
    if (already) {
      return { state: 'answered', title: form.title, message: 'You have already responded to this form.' };
    }
  }

  let guaranteeing: { reference: string; applicant: string; amount: string | null } | null = null;
  const reference = normalizeReference(app);
  if (form.purpose === 'GUARANTOR' && reference) {
    const target = await guaranteeTarget(reference);
    if (!target) {
      return { state: 'closed', title: form.title, message: `We could not find loan application ${reference}. Check the link with the applicant.` };
    }
    if (target._count.guarantors >= GUARANTORS_REQUIRED) {
      return { state: 'closed', title: form.title, message: `Application ${reference} already has its ${GUARANTORS_REQUIRED} guarantors. Thank you.` };
    }
    const answers = (target.answers ?? {}) as Answers;
    const d = applicantDetails(answers);
    const amount = Number(answers.amount);
    guaranteeing = {
      reference,
      applicant: [d.firstName, d.lastName].filter(Boolean).join(' ') || 'the applicant',
      amount: Number.isFinite(amount) && amount > 0 ? formatCurrency(amount) : null,
    };
  }

  return {
    state: 'open',
    preview,
    form: {
      title: form.title, description: form.description, audience: form.audience,
      questions: withGuarantorCheques(form.purpose, readQuestions(form.questions)),
      purpose: form.purpose,
    },
    respondent: staff ? fullName(staff) : null,
    guaranteeing,
    sharedBy: isCustomerPurpose(form.purpose) ? fullName(await referrerFor(form, by)) : null,
  };
}

/** What the respondent is shown after submitting. */
export interface SubmitReceipt {
  errors?: Record<string, string>;
  /** Customer applications: the reference to quote. */
  reference?: string;
  /** Loan applications: the path guarantors open (/f/<slug>?app=REF), or null when no guarantor form is open. */
  guarantorPath?: string | null;
  /** A guarantor's form: the applicant they now stand behind. */
  guaranteeing?: string;
  /** The form's fee, to pay at the office, and how it was worked out. */
  fee?: { due: number; basis: string };
}

/** The fee an admin has set for a kind of form, or the paper form's until they do. */
async function feeSettingFor(purpose: CustomerPurpose): Promise<FeeSetting | null> {
  const row = await prisma.applicationFee.findUnique({ where: { purpose } });
  if (!row) return DEFAULT_FEES[purpose] ?? null;
  return { kind: row.kind, amount: row.amount.toNumber(), isActive: row.isActive };
}

/**
 * Records an answer. PUBLIC for public forms. `app` is the loan application a
 * guarantor stands behind; `by` the referral code of the staff member whose
 * link was used.
 */
export async function submitFormResponse(
  slug: string,
  answers: Record<string, unknown>,
  /** Honeypot. Real people never see this field, so anything in it is a bot. */
  website?: string,
  app?: string,
  by?: string
): Promise<ActionResult<SubmitReceipt>> {
  try {
    const form = await prisma.form.findUnique({ where: { slug: String(slug).slice(0, 80) } });
    if (!form || form.status === 'DRAFT') return { success: false, error: 'This form does not exist' };

    const confirmation = form.confirmationMessage || DEFAULT_CONFIRMATION;
    // A filled honeypot is a bot. Report success so it learns nothing.
    if (website && website.trim()) return { success: true, message: confirmation };

    if (!isAcceptingResponses(form)) return { success: false, error: 'This form is no longer taking responses' };

    const staff = await currentStaff();
    if (form.audience === 'STAFF' && !staff) return { success: false, error: 'Sign in with your staff account to respond' };

    let payloadSize = 0;
    try {
      payloadSize = JSON.stringify(answers ?? {}).length;
    } catch {
      return { success: false, error: 'The answers could not be read' };
    }
    if (payloadSize > MAX_PAYLOAD) return { success: false, error: 'The response is too long' };

    // The slug ties every attached file to this form's own upload folder.
    const result = validateAnswers(withGuarantorCheques(form.purpose, readQuestions(form.questions)), answers, form.slug);
    if (!result.ok) {
      return { success: false, error: 'Some answers need attention', data: { errors: result.errors } };
    }

    const recent = await prisma.formResponse.count({
      where: { formId: form.id, submittedAt: { gte: new Date(Date.now() - 60_000) } },
    });
    if (recent >= FLOOD_PER_MINUTE) {
      return { success: false, error: 'This form is busy. Please try again in a minute.' };
    }

    if (staff && form.audience === 'STAFF' && form.oneResponsePerStaff) {
      const already = await prisma.formResponse.findFirst({ where: { formId: form.id, staffId: staff.id }, select: { id: true } });
      if (already) return { success: false, error: 'You have already responded to this form' };
    }

    const onboarding = form.purpose === 'STAFF_ONBOARDING';
    const customer = isCustomerPurpose(form.purpose) ? form.purpose : null;

    // A guarantor names the application they stand behind: from their link,
    // or typed on the form. Without one, an officer attaches them by hand.
    let guarantorForId: string | null = null;
    let guaranteeing: string | undefined;
    if (customer === 'GUARANTOR' && app && app.trim()) {
      const reference = normalizeReference(app);
      const target = await guaranteeTarget(reference);
      if (!target) {
        return { success: false, error: 'We could not find that application number. Check it with the applicant, or leave it empty.' };
      }
      if (target._count.guarantors >= GUARANTORS_REQUIRED) {
        return { success: false, error: `Application ${reference} already has its ${GUARANTORS_REQUIRED} guarantors.` };
      }
      guarantorForId = target.id;
      const d = applicantDetails((target.answers ?? {}) as Answers);
      guaranteeing = `${d.firstName} ${d.lastName}`.trim();
    }

    // A staff member's personal link: credit them. An unknown code is ignored,
    // not an error. On a staff member's own form, its maker is the referrer.
    const referrer = customer ? await referrerFor(form, by) : null;

    // The fee in force now is the one this applicant owes, whatever it is changed to later.
    const fee = customer ? computeFee(await feeSettingFor(customer), applicationTerms(customer, result.answers).amount) : null;

    let response: { id: string; reference: string | null } | null = null;
    // A reference is random; on the rare clash, draw another.
    for (let attempt = 0; !response; attempt++) {
      try {
        response = await prisma.formResponse.create({
          data: {
            formId: form.id,
            // A staff member answering a public form is still named, which is
            // what lets an admin see who said what.
            staffId: staff?.id ?? null,
            answers: result.answers as Prisma.InputJsonValue,
            ...(onboarding || customer ? { onboardingStatus: 'PENDING' as const } : {}),
            ...(customer ? { reference: makeReference(customer), guarantorForId } : {}),
            ...(fee ? { feeDue: fee.due, feeBasis: fee.basis } : {}),
            ...(referrer ? { referredById: referrer.id } : {}),
          },
          select: { id: true, reference: true },
        });
      } catch (error) {
        const clash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!clash || attempt >= 4) throw error;
      }
    }

    if (onboarding) {
      const who = onboardingDetails(result.answers);
      await createNotificationForUsers(await staffCreatorIds(), {
        type: 'APPROVAL_REQUIRED',
        title: 'New staff onboarding request',
        message: `${who.firstName} ${who.lastName} submitted their details. Review and create their account.`,
        entityType: 'FORM_RESPONSE',
        entityId: response.id,
        actionUrl: '/hr/joiners',
      });
    }

    if (customer) {
      const who = applicantDetails(result.answers);
      const name = `${who.firstName} ${who.lastName}`.trim() || 'Someone';
      const info = PURPOSE_INFO[customer];
      await createNotificationForUsers(await applicationReviewerIds(customer, form.branchId), {
        type: 'APPROVAL_REQUIRED',
        title: customer === 'GUARANTOR' ? 'New guarantor form' : `New ${info.label.toLowerCase()} application`,
        message:
          customer === 'GUARANTOR'
            ? `${name} filled the guarantor form${guaranteeing ? ` for ${guaranteeing}` : ', not yet attached to an application'}.`
            : `${name} applied (${response.reference})${referrer ? `, referred by ${referrer.firstName} ${referrer.lastName}` : ''}. Review and profile them.`,
        entityType: 'FORM_RESPONSE',
        entityId: response.id,
        actionUrl: `/applications?kind=${customer === 'GUARANTOR' ? 'LOAN_APPLICATION' : customer}`,
      });

      // Tell the referrer their client applied.
      if (referrer) {
        await createNotificationForUsers([referrer.id], {
          type: 'TASK_ASSIGNED',
          title: 'Your client applied',
          message: `${name} filled the ${info.title.toLowerCase()} from your link (${response.reference}).`,
          entityType: 'FORM_RESPONSE',
          entityId: response.id,
          actionUrl: '/my-forms',
        });
      }

      const receipt: SubmitReceipt = { reference: response.reference ?? undefined, guaranteeing, fee: fee ?? undefined };
      if (customer === 'LOAN_APPLICATION') {
        const guarantorForm = await openGuarantorForm();
        receipt.guarantorPath = guarantorForm ? `/f/${guarantorForm.slug}?app=${response.reference}` : null;
      }
      return { success: true, message: confirmation, data: receipt };
    }

    return { success: true, message: confirmation };
  } catch (error) {
    console.error('Form response failed:', error);
    return { success: false, error: 'Your response could not be saved. Please try again.' };
  }
}

/** Open staff forms, and which of them this staff member has answered. */
export async function getMyForms() {
  const { user } = await getSession();
  const now = new Date();
  const forms = await prisma.form.findMany({
    where: { audience: 'STAFF', status: 'OPEN', OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
    orderBy: { publishedAt: 'desc' },
    include: { responses: { where: { staffId: user.id }, select: { submittedAt: true }, orderBy: { submittedAt: 'desc' }, take: 1 } },
  });
  return forms.map((f) => ({
    id: f.id,
    slug: f.slug,
    title: f.title,
    description: f.description,
    closesAt: f.closesAt?.toISOString() ?? null,
    questionCount: readQuestions(f.questions).length,
    respondedAt: f.responses[0]?.submittedAt.toISOString() ?? null,
    oneResponsePerStaff: f.oneResponsePerStaff,
  }));
}
