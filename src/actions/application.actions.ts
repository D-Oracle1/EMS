'use server';

/**
 * Customer applications — Server Actions
 * Hylink Finance Limited EMS
 *
 * People who are not profiled in the office fill a public application form
 * (lib/customer-forms): savings, mutual partnership, fixed deposit or loan.
 * Each one waits here as PENDING for that product's officers and their
 * supervisors. The officer corrects any typo, links the applicant to an
 * existing customer with the same phone or email or profiles them as a new
 * customer, and is then taken to the normal new-account screen, filled in
 * from the form. Opening the account there keeps every money and accounting
 * check that screen already applies.
 *
 * A loan application collects its two guarantors' forms, attached by their
 * link (/f/<slug>?app=REF) or here by hand. They are carried into the new
 * loan's guarantors when the application is approved.
 *
 * Who: anyone holding one of the kind's reviewer permissions
 * (PURPOSE_INFO.reviewers), within their branch scope.
 */

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { generateReference } from '@/lib/utils';
import { branchScopeFor, NO_BRANCH } from '@/lib/branch-scope';
import { createCustomerInTx, validateNewCustomer } from '@/lib/customer-registration';
import { provisionCustomerLogin } from '@/lib/customer-auth';
import { answerText, readFiles, readQuestions, type Answers, type FileAnswer } from '@/lib/forms';
import {
  applicantDetails, applicationTerms, canReviewPurpose, guarantorDetails, isApplicantPurpose, isCustomerPurpose,
  phoneKey, reviewablePurposes, normalizeReference, fixedDepositTerms, PURPOSE_INFO, GUARANTORS_REQUIRED, withGuarantorCheques,
  type ApplicantDetails, type CustomerPurpose,
} from '@/lib/customer-forms';
import { feeSummaries, type FeeSummary } from '@/lib/fee-ledger';
import type { FeeState } from '@/lib/fees';
import type { Prisma } from '@prisma/client';
import type { ActionResult, SessionUser } from '@/types';

type ApplicantPurpose = Exclude<CustomerPurpose, 'GUARANTOR'>;
type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const fullName = (s?: { firstName: string; lastName: string } | null) => (s ? `${s.firstName} ${s.lastName}` : null);

/** Fields the review card edits in place; everything else is listed as answered. */
const EDITABLE = new Set(['firstName', 'middleName', 'lastName', 'phone', 'email', 'address']);

/** Where approving each kind takes the officer next. */
const NEXT_SCREEN: Record<ApplicantPurpose, string> = {
  SAVINGS_APPLICATION: '/savings/create',
  PARTNERSHIP_APPLICATION: '/savings/create',
  FIXED_DEPOSIT_APPLICATION: '/fixed-deposits/new',
  LOAN_APPLICATION: '/loans/new',
};

async function requireReviewer(purpose: CustomerPurpose): Promise<SessionUser> {
  const { user } = await getSession();
  if (!canReviewPurpose(user, purpose)) throw new Error('Permission denied');
  return user;
}

/** Applications this person may see: their branch's, and those from forms sent to every branch. */
function scopeWhere(scope: string | null): Prisma.FormResponseWhereInput {
  return scope ? { form: { OR: [{ branchId: null }, { branchId: scope }] } } : {};
}

function inFormScope(scope: string | null, formBranchId: string | null): boolean {
  return !scope || formBranchId === null || formBranchId === scope;
}

/** Every answer in form order, as label and text or files. The edited fields are left out. */
function answeredList(questions: unknown, answers: Answers) {
  return readQuestions(questions)
    .filter((q) => !EDITABLE.has(q.id) && answers[q.id] != null)
    .map((q) => {
      const files = q.type === 'FILE' ? readFiles(answers[q.id]) : null;
      return { label: q.label, text: files ? '' : answerText(answers[q.id]), files: (files ?? []) as FileAnswer[] };
    })
    .filter((x) => x.text || x.files.length);
}

export async function getApplicationAccess() {
  const { user } = await getSession();
  return { kinds: reviewablePurposes(user) };
}

/** Waiting applications per kind, for the tabs. */
export async function getApplicationCounts(): Promise<Partial<Record<ApplicantPurpose, number>>> {
  const { user } = await getSession();
  const kinds = reviewablePurposes(user);
  if (!kinds.length) return {};
  const scope = await branchScopeFor(user);
  const rows = await prisma.formResponse.groupBy({
    by: ['formId'],
    where: { onboardingStatus: 'PENDING', form: { purpose: { in: kinds } }, ...scopeWhere(scope) },
    _count: { _all: true },
  });
  const forms = await prisma.form.findMany({ where: { id: { in: rows.map((r) => r.formId) } }, select: { id: true, purpose: true } });
  const purposeOf = new Map(forms.map((f) => [f.id, f.purpose]));
  const counts: Partial<Record<ApplicantPurpose, number>> = {};
  for (const r of rows) {
    const p = purposeOf.get(r.formId) as ApplicantPurpose;
    counts[p] = (counts[p] ?? 0) + r._count._all;
  }
  return counts;
}

/** Existing customers sharing a phone number or email with an applicant: probably the same person. */
async function findMatches(scope: string | null, people: Pick<ApplicantDetails, 'phone' | 'email'>[]) {
  const phones = Array.from(new Set(people.map((p) => phoneKey(p.phone)).filter((x): x is string => !!x)));
  const emails = Array.from(new Set(people.map((p) => p.email).filter((x): x is string => !!x)));
  if (!phones.length && !emails.length) return [];
  return prisma.customer.findMany({
    where: {
      isDeleted: false,
      ...(scope ? { branchId: scope } : {}),
      OR: [...phones.map((k) => ({ phone: { endsWith: k } })), ...(emails.length ? [{ email: { in: emails, mode: 'insensitive' as const } }] : [])],
    },
    select: { id: true, customerNumber: true, firstName: true, lastName: true, phone: true, email: true, status: true },
    take: 200,
  });
}

export type Application = Awaited<ReturnType<typeof getApplications>>[number];
export type GuarantorEntry = Application['guarantors'][number];

/** Applications of one kind in one state: every pending one, or the latest 100 decided. */
export async function getApplications(kind: ApplicantPurpose, status: ReviewStatus = 'PENDING') {
  const user = await requireReviewer(kind);
  if (!isApplicantPurpose(kind)) throw new Error('Unknown kind of application');
  const scope = await branchScopeFor(user);

  const rows = await prisma.formResponse.findMany({
    where: { onboardingStatus: status, form: { purpose: kind }, ...scopeWhere(scope) },
    orderBy: { submittedAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: status === 'PENDING' ? 500 : 100,
    include: {
      form: { select: { title: true, questions: true, branchId: true, branch: { select: { name: true } } } },
      customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true } },
      reviewedBy: { select: { firstName: true, lastName: true } },
      referredBy: { select: { firstName: true, lastName: true } },
      guarantors: {
        orderBy: { submittedAt: 'asc' },
        include: { form: { select: { questions: true } }, reviewedBy: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  const details = rows.map((r) => applicantDetails((r.answers ?? {}) as Answers));
  const matches = status === 'PENDING' ? await findMatches(scope, details) : [];
  const fees = await feeSummaries([...rows.map((r) => r.id), ...rows.flatMap((r) => r.guarantors.map((g) => g.id))]);
  const feeOf = (id: string): FeeSummary | null => {
    const f = fees.get(id);
    return f && f.state !== 'NONE' ? f : null;
  };

  return rows.map((r, i) => {
    const answers = (r.answers ?? {}) as Answers;
    const d = details[i];
    const key = phoneKey(d.phone);
    const same = matches.filter(
      (c) => (key && phoneKey(c.phone) === key) || (d.email && c.email && c.email.toLowerCase() === d.email)
    );
    return {
      id: r.id,
      reference: r.reference,
      formTitle: r.form.title,
      branch: r.form.branch?.name ?? null,
      formBranchId: r.form.branchId,
      submittedAt: r.submittedAt.toISOString(),
      details: d,
      terms: applicationTerms(kind, answers),
      answered: answeredList(r.form.questions, answers),
      matches: same.map((c) => ({ id: c.id, customerNumber: c.customerNumber, name: `${c.firstName} ${c.lastName}`, phone: c.phone, status: c.status })),
      customer: r.customer ? { id: r.customer.id, customerNumber: r.customer.customerNumber, name: fullName(r.customer) } : null,
      nextUrl: r.customer && kind in NEXT_SCREEN ? `${NEXT_SCREEN[kind]}?application=${r.id}` : null,
      reviewedBy: fullName(r.reviewedBy),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewNote: r.reviewNote,
      fee: feeOf(r.id),
      loanCreated: !!r.loanId,
      /** The staff member whose personal link the applicant used (lib/referrals). */
      referredBy: fullName(r.referredBy),
      guarantors: r.guarantors.map((g) => {
        const ga = (g.answers ?? {}) as Answers;
        return {
          id: g.id,
          reference: g.reference,
          status: g.onboardingStatus,
          submittedAt: g.submittedAt.toISOString(),
          details: guarantorDetails(ga),
          answered: answeredList(withGuarantorCheques('GUARANTOR', readQuestions(g.form.questions)), ga),
          reviewedBy: fullName(g.reviewedBy),
          reviewNote: g.reviewNote,
          fee: feeOf(g.id),
        };
      }),
    };
  });
}

/** Guarantor forms filled without an application number, waiting to be attached to one. */
export async function getUnlinkedGuarantors() {
  const user = await requireReviewer('GUARANTOR');
  const scope = await branchScopeFor(user);
  const rows = await prisma.formResponse.findMany({
    where: { onboardingStatus: 'PENDING', guarantorForId: null, form: { purpose: 'GUARANTOR' }, ...scopeWhere(scope) },
    orderBy: { submittedAt: 'desc' },
    take: 200,
    include: { form: { select: { questions: true } } },
  });
  const fees = await feeSummaries(rows.map((g) => g.id));
  return rows.map((g) => {
    const ga = (g.answers ?? {}) as Answers;
    const fee = fees.get(g.id);
    return {
      id: g.id,
      reference: g.reference,
      submittedAt: g.submittedAt.toISOString(),
      details: guarantorDetails(ga),
      answered: answeredList(withGuarantorCheques('GUARANTOR', readQuestions(g.form.questions)), ga),
      fee: fee && fee.state !== 'NONE' ? fee : null,
    };
  });
}

export interface ApproveInput {
  responseId: string;
  /** The applicant's details as the officer left them: typos corrected. */
  details: Pick<ApplicantDetails, 'firstName' | 'middleName' | 'lastName' | 'phone' | 'email' | 'address'>;
  /** Link to this existing customer instead of profiling a new one. */
  existingCustomerId?: string;
  /** Senior staff only, when the form is not tied to a branch: where the new customer belongs. */
  branchId?: string;
}

/**
 * Profiles the applicant (or links them to an existing customer) and returns
 * the new-account screen to open next, filled in from the application.
 */
export async function approveApplication(input: ApproveInput): Promise<ActionResult<{ customerId: string; customerNumber: string; nextUrl: string }>> {
  try {
    const { user } = await getSession();
    const response = await prisma.formResponse.findUnique({
      where: { id: input.responseId },
      include: { form: { select: { purpose: true, branchId: true } } },
    });
    if (!response || !isApplicantPurpose(response.form.purpose)) return { success: false, error: 'Application not found' };
    const kind = response.form.purpose;
    if (!canReviewPurpose(user, kind)) return { success: false, error: 'Permission denied' };
    const scope = await branchScopeFor(user);
    if (!inFormScope(scope, response.form.branchId)) return { success: false, error: 'Application not found' };
    if (response.onboardingStatus !== 'PENDING') return { success: false, error: 'This application was already decided' };

    const original = applicantDetails((response.answers ?? {}) as Answers);
    const clean = (v: string | undefined) => (typeof v === 'string' ? v.trim() : '');
    const details: ApplicantDetails = {
      ...original,
      firstName: clean(input.details.firstName),
      middleName: clean(input.details.middleName) || undefined,
      lastName: clean(input.details.lastName),
      phone: clean(input.details.phone),
      email: clean(input.details.email).toLowerCase() || undefined,
      address: clean(input.details.address),
    };

    // Linking: the customer must be one this officer can see.
    let existing: { id: string; customerNumber: string } | null = null;
    if (input.existingCustomerId) {
      existing = await prisma.customer.findFirst({
        where: { id: input.existingCustomerId, isDeleted: false, ...(scope ? { branchId: scope } : {}) },
        select: { id: true, customerNumber: true },
      });
      if (!existing) return { success: false, error: 'That customer was not found' };
    } else {
      const problem = validateNewCustomer(details);
      if (problem) return { success: false, error: problem.replace('New customer requires', 'The applicant needs') };
      if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) return { success: false, error: 'The email address is not valid' };
    }

    // The form's own branch; else the officer's; senior staff, who have no
    // single branch, choose one.
    const branchId =
      response.form.branchId ??
      (scope === null ? input.branchId || null : scope === NO_BRANCH ? null : scope);
    if (!existing && !branchId) {
      return { success: false, error: scope === null ? 'Choose the branch this customer belongs to' : 'You are not posted to a branch, so you cannot profile customers' };
    }
    if (!existing && branchId && scope === null && !response.form.branchId) {
      const ok = await prisma.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } });
      if (!ok) return { success: false, error: 'That branch is not available' };
    }

    // Claim first, so two officers approving at once cannot profile the applicant twice.
    const claim = await prisma.formResponse.updateMany({
      where: { id: response.id, onboardingStatus: 'PENDING' },
      data: { onboardingStatus: 'APPROVED', reviewedById: user.id, reviewedAt: new Date() },
    });
    if (claim.count === 0) return { success: false, error: 'Already approved or rejected by someone else' };

    let customer: { id: string; customerNumber: string };
    try {
      if (existing) {
        customer = existing;
        await prisma.formResponse.update({ where: { id: response.id }, data: { customerId: existing.id } });
      } else {
        const customerNumber = await generateReference('CUSTOMER');
        customer = await prisma.$transaction(async (tx) => {
          const made = await createCustomerInTx(tx, details, { customerNumber, branchId: branchId!, createdBy: user.id });
          await tx.formResponse.update({ where: { id: response.id }, data: { customerId: made.id } });
          return { id: made.id, customerNumber: made.customerNumber };
        });
        await provisionCustomerLogin(customer.id);
      }
    } catch (error) {
      // Nothing was made: put the application back in the queue.
      await prisma.formResponse.update({
        where: { id: response.id },
        data: { onboardingStatus: 'PENDING', reviewedById: null, reviewedAt: null },
      });
      throw error;
    }

    // A loan's guarantors are accepted with it.
    if (kind === 'LOAN_APPLICATION') {
      await prisma.formResponse.updateMany({
        where: { guarantorForId: response.id, onboardingStatus: 'PENDING' },
        data: { onboardingStatus: 'APPROVED', reviewedById: user.id, reviewedAt: new Date() },
      });
    }

    const name = `${details.firstName} ${details.lastName}`;
    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'APPROVE', module: 'CUSTOMERS', entityType: 'CUSTOMER_APPLICATION', entityId: response.id,
      description: existing
        ? `Approved ${PURPOSE_INFO[kind].label.toLowerCase()} application ${response.reference} and linked it to customer ${customer.customerNumber}`
        : `Approved ${PURPOSE_INFO[kind].label.toLowerCase()} application ${response.reference}: profiled ${name} as customer ${customer.customerNumber}`,
    });

    return {
      success: true,
      message: existing ? `Linked to ${customer.customerNumber}` : `${name} profiled as ${customer.customerNumber}`,
      data: { customerId: customer.id, customerNumber: customer.customerNumber, nextUrl: `${NEXT_SCREEN[kind]}?application=${response.id}` },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Approval failed' };
  }
}

/** The response, if this person reviews its kind and it is in their scope. */
async function reviewable(user: SessionUser, id: string) {
  const r = await prisma.formResponse.findUnique({
    where: { id },
    include: { form: { select: { purpose: true, branchId: true } } },
  });
  if (!r || !isCustomerPurpose(r.form.purpose) || !canReviewPurpose(user, r.form.purpose)) return null;
  if (!inFormScope(await branchScopeFor(user), r.form.branchId)) return null;
  return r as typeof r & { form: { purpose: CustomerPurpose } };
}

/**
 * Turns an application or a guarantor down, with an optional note. Nothing is
 * created. A rejected guarantor frees their place, so the applicant can send
 * the link to someone else.
 */
export async function rejectApplication(id: string, note?: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    const r = await reviewable(user, id);
    if (!r) return { success: false, error: 'Not found' };
    const result = await prisma.formResponse.updateMany({
      where: { id, onboardingStatus: 'PENDING' },
      data: { onboardingStatus: 'REJECTED', reviewedById: user.id, reviewedAt: new Date(), reviewNote: note?.trim().slice(0, 500) || null },
    });
    if (result.count === 0) return { success: false, error: 'Already approved or rejected' };
    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'REJECT', module: 'CUSTOMERS', entityType: 'CUSTOMER_APPLICATION', entityId: id,
      description: `Rejected ${PURPOSE_INFO[r.form.purpose].label.toLowerCase()} form ${r.reference ?? ''}${note ? `: ${note.trim().slice(0, 200)}` : ''}`,
    });
    return { success: true, message: r.form.purpose === 'GUARANTOR' ? 'Guarantor rejected' : 'Application rejected' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not reject' };
  }
}

/** Attaches a guarantor's form to a loan application, by the application's id or its reference. */
export async function attachGuarantor(guarantorId: string, application: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    const g = await reviewable(user, guarantorId);
    if (!g || g.form.purpose !== 'GUARANTOR') return { success: false, error: 'Guarantor form not found' };
    if (g.onboardingStatus !== 'PENDING') return { success: false, error: 'This guarantor was already decided' };

    const reference = normalizeReference(application);
    const target = await prisma.formResponse.findFirst({
      where: reference ? { reference } : { id: application },
      include: {
        form: { select: { purpose: true, branchId: true } },
        _count: { select: { guarantors: { where: { onboardingStatus: { not: 'REJECTED' }, id: { not: guarantorId } } } } },
      },
    });
    if (!target || target.form.purpose !== 'LOAN_APPLICATION' || !inFormScope(await branchScopeFor(user), target.form.branchId)) {
      return { success: false, error: 'Loan application not found' };
    }
    if (target.onboardingStatus === 'REJECTED') return { success: false, error: 'That application was rejected' };
    if (target._count.guarantors >= GUARANTORS_REQUIRED) {
      return { success: false, error: `That application already has ${GUARANTORS_REQUIRED} guarantors` };
    }

    await prisma.formResponse.update({
      where: { id: guarantorId },
      data: {
        guarantorForId: target.id,
        // Joining an application that is already approved: accepted with it.
        ...(target.onboardingStatus === 'APPROVED' ? { onboardingStatus: 'APPROVED', reviewedById: user.id, reviewedAt: new Date() } : {}),
      },
    });
    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'UPDATE', module: 'CUSTOMERS', entityType: 'CUSTOMER_APPLICATION', entityId: guarantorId,
      description: `Attached guarantor ${g.reference ?? ''} to loan application ${target.reference ?? target.id}`,
    });
    return { success: true, message: `Attached to ${target.reference}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not attach the guarantor' };
  }
}

/** Takes a guarantor off an application, back to the unattached list. */
export async function detachGuarantor(guarantorId: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    const g = await reviewable(user, guarantorId);
    if (!g || g.form.purpose !== 'GUARANTOR') return { success: false, error: 'Guarantor form not found' };
    if (g.onboardingStatus !== 'PENDING') return { success: false, error: 'Only a waiting guarantor can be moved' };
    await prisma.formResponse.update({ where: { id: guarantorId }, data: { guarantorForId: null } });
    return { success: true, message: 'Guarantor detached' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not detach the guarantor' };
  }
}

export interface ApplicationPrefill {
  /** The application's id, which the new loan names so its upfront fee is honoured. */
  id: string;
  purpose: ApplicantPurpose;
  /** The form's fee: whether it is settled. */
  fee?: { state: FeeState; balance: number; basis: string | null };
  reference: string | null;
  customer: { id: string; customerNumber: string; firstName: string; lastName: string };
  amount: number | null;
  /** Savings and partnership: what to look for among the fixed savings plans. */
  savings?: { durationMonths: number | null; durationText: string | null; totalRate: number | null; partnership: boolean };
  /** Fixed deposit: the paper form's contract as tenure days and an annual rate. */
  fixedDeposit?: { planLabel: string; tenureDays: number; annualRate: number };
  /** Loan. */
  loan?: { tenureMonths: number | null; purpose: string | null; guarantors: ReturnType<typeof guarantorDetails>[] };
}

/**
 * What a new-account screen fills in from an approved application
 * (/savings/create, /fixed-deposits/new or /loans/new ?application=<id>).
 */
export async function getApplicationPrefill(id: string): Promise<ApplicationPrefill | null> {
  const { user } = await getSession();
  const r = await prisma.formResponse.findUnique({
    where: { id: String(id).slice(0, 64) },
    include: {
      form: { select: { purpose: true, branchId: true } },
      customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true } },
      guarantors: { where: { onboardingStatus: { not: 'REJECTED' } }, orderBy: { submittedAt: 'asc' }, select: { answers: true } },
    },
  });
  if (!r || !isApplicantPurpose(r.form.purpose) || !canReviewPurpose(user, r.form.purpose)) return null;
  if (!inFormScope(await branchScopeFor(user), r.form.branchId)) return null;
  if (r.onboardingStatus !== 'APPROVED' || !r.customer) return null;

  const kind = r.form.purpose;
  const answers = (r.answers ?? {}) as Answers;
  const terms = applicationTerms(kind, answers);
  const prefill: ApplicationPrefill = { id: r.id, purpose: kind, reference: r.reference, customer: r.customer, amount: terms.amount };
  const fee = (await feeSummaries([r.id])).get(r.id);
  if (fee && fee.state !== 'NONE') prefill.fee = { state: fee.state, balance: fee.balance, basis: fee.basis };

  if (kind === 'SAVINGS_APPLICATION' || kind === 'PARTNERSHIP_APPLICATION') {
    prefill.savings = {
      durationMonths: terms.durationMonths,
      durationText: terms.durationText,
      totalRate: terms.plan?.totalRate ?? null,
      partnership: kind === 'PARTNERSHIP_APPLICATION',
    };
  }
  if (kind === 'FIXED_DEPOSIT_APPLICATION' && terms.plan) {
    prefill.fixedDeposit = { planLabel: terms.plan.label, ...fixedDepositTerms(terms.plan) };
  }
  if (kind === 'LOAN_APPLICATION') {
    prefill.loan = {
      tenureMonths: terms.tenureMonths,
      purpose: terms.loanPurpose,
      guarantors: r.guarantors.map((g) => guarantorDetails((g.answers ?? {}) as Answers)),
    };
  }
  return prefill;
}

/** Application forms a customer filled, for their profile page: whoever may open the profile sees them. */
export async function getCustomerApplications(customerId: string) {
  const { user } = await getSession();
  if (!user.permissions.includes('CUSTOMERS:READ') && !reviewablePurposes(user).length) return [];
  const scope = await branchScopeFor(user);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...(scope ? { branchId: scope } : {}) },
    select: { id: true },
  });
  if (!customer) return [];
  const rows = await prisma.formResponse.findMany({
    where: { customerId },
    orderBy: { submittedAt: 'desc' },
    include: { form: { select: { title: true, purpose: true, questions: true } }, reviewedBy: { select: { firstName: true, lastName: true } } },
  });
  return rows
    .filter((r) => isCustomerPurpose(r.form.purpose))
    .map((r) => {
      const answers = (r.answers ?? {}) as Answers;
      return {
        id: r.id,
        reference: r.reference,
        formTitle: r.form.title,
        submittedAt: r.submittedAt.toISOString(),
        reviewedBy: fullName(r.reviewedBy),
        answers: withGuarantorCheques(r.form.purpose, readQuestions(r.form.questions))
          .filter((q) => answers[q.id] != null)
          .map((q) => {
            const files = q.type === 'FILE' ? readFiles(answers[q.id]) : null;
            return { label: q.label, text: files ? '' : answerText(answers[q.id]), files: (files ?? []) as FileAnswer[] };
          })
          .filter((x) => x.text || x.files.length),
      };
    });
}

/** Branches a senior reviewer may profile a customer into. */
export async function getApplicationBranches() {
  const { user } = await getSession();
  if (!reviewablePurposes(user).length) return [];
  if ((await branchScopeFor(user)) !== null) return [];
  return prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
}
