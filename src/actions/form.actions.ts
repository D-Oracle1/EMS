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
 */

import { Prisma } from '@prisma/client';
import { del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotificationForUsers } from '@/lib/notifications';
import {
  canManageForms, normalizeQuestions, readQuestions, validateAnswers, isAcceptingResponses,
  makeSlug, LIMITS, readFiles, type FormQuestion, type Answers,
} from '@/lib/forms';
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
}

export async function getFormAccess() {
  const user = await currentStaff();
  return { canManage: !!user && canManageForms(user) };
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export async function getForms() {
  await requireManager();
  const forms = await prisma.form.findMany({
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
  await requireManager();
  const f = await prisma.form.findUnique({ where: { id }, include: { _count: { select: { responses: true } } } });
  if (!f) return null;
  return {
    id: f.id,
    slug: f.slug,
    title: f.title,
    description: f.description ?? '',
    audience: f.audience,
    status: f.status,
    confirmationMessage: f.confirmationMessage ?? '',
    oneResponsePerStaff: f.oneResponsePerStaff,
    closesAt: f.closesAt?.toISOString() ?? null,
    questions: readQuestions(f.questions),
    responseCount: f._count.responses,
  };
}

function cleanInput(data: FormInput) {
  const title = (data.title ?? '').trim().slice(0, LIMITS.title);
  if (!title) throw new Error('Give the form a title');
  const audience = data.audience === 'STAFF' ? 'STAFF' : 'PUBLIC';
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
    questions: normalizeQuestions(data.questions) as unknown as Prisma.InputJsonValue,
  } as const;
}

/** Creates a form (no id) or saves changes to one. New forms start as drafts. */
export async function saveForm(data: FormInput, id?: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireManager();
    const values = cleanInput(data);

    if (id) {
      const existing = await prisma.form.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return { success: false, error: 'Form not found' };
      await prisma.form.update({ where: { id }, data: values });
      await auditLog({
        userId: user.id, action: 'UPDATE', module: 'FORMS', entityType: 'FORM', entityId: id,
        description: `Edited form "${values.title}"`,
      });
      return { success: true, message: 'Form saved', data: { id } };
    }

    const form = await prisma.form.create({
      data: { ...values, slug: makeSlug(values.title), createdById: user.id },
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

/** Opens, closes or returns a form to draft. Opening a staff form the first time tells every staff member. */
export async function setFormStatus(id: string, status: 'DRAFT' | 'OPEN' | 'CLOSED'): Promise<ActionResult> {
  try {
    const user = await requireManager();
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

    if (firstOpening && form.audience === 'STAFF') {
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
    const user = await requireManager();
    const form = await prisma.form.findUnique({
      where: { id },
      include: { _count: { select: { responses: true } }, responses: { select: { answers: true } } },
    });
    if (!form) return { success: false, error: 'Form not found' };
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
    const user = await requireManager();
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
        questions: form.questions as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
    return { success: true, message: 'Copy created', data: { id: copy.id } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not copy the form' };
  }
}

export async function getFormResponses(id: string) {
  await requireManager();
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
    status: form.status,
    accepting: isAcceptingResponses(form),
    closesAt: form.closesAt?.toISOString() ?? null,
    questions: readQuestions(form.questions),
    responses: form.responses.map((r) => ({
      id: r.id,
      submittedAt: r.submittedAt.toISOString(),
      respondent: fullName(r.staff),
      respondentDetail: r.staff ? [r.staff.employeeId, r.staff.department?.name].filter(Boolean).join(' · ') : null,
      answers: (r.answers ?? {}) as Answers,
    })),
  };
}

export async function deleteFormResponse(id: string): Promise<ActionResult> {
  try {
    const user = await requireManager();
    const response = await prisma.formResponse.findUnique({ where: { id }, include: { form: { select: { title: true } } } });
    if (!response) return { success: false, error: 'Response not found' };
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
  | { state: 'closed'; title: string }
  | { state: 'login'; title: string }
  | { state: 'answered'; title: string; message: string }
  | {
      state: 'open';
      /** A manager looking at a draft: shown, but it cannot be submitted. */
      preview: boolean;
      form: { title: string; description: string | null; audience: 'PUBLIC' | 'STAFF'; questions: FormQuestion[] };
      respondent: string | null;
    };

const DEFAULT_CONFIRMATION = 'Thank you. Your response has been recorded.';

/** What the share link shows. PUBLIC. */
export async function getPublicForm(slug: string): Promise<PublicFormState> {
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

  return {
    state: 'open',
    preview,
    form: { title: form.title, description: form.description, audience: form.audience, questions: readQuestions(form.questions) },
    respondent: staff ? fullName(staff) : null,
  };
}

/** Records an answer. PUBLIC for public forms. */
export async function submitFormResponse(
  slug: string,
  answers: Record<string, unknown>,
  /** Honeypot. Real people never see this field, so anything in it is a bot. */
  website?: string
): Promise<ActionResult<{ errors?: Record<string, string> }>> {
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
    const result = validateAnswers(readQuestions(form.questions), answers, form.slug);
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

    await prisma.formResponse.create({
      data: {
        formId: form.id,
        // A staff member answering a public form is still named, which is
        // what lets an admin see who said what.
        staffId: staff?.id ?? null,
        answers: result.answers as Prisma.InputJsonValue,
      },
    });

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
