/**
 * Customer application forms: savings, mutual partnership, fixed deposit,
 * loan and guarantor.
 *
 * The lines this file holds:
 *  - Each form keeps the questions approval reads, typed as they must be,
 *    and every ready-made form is a valid form.
 *  - Answers become a customer profile and the terms asked for; a fixed
 *    deposit's "15% for 6 months" pays 15% through the deposit engine's
 *    annual-rate formula.
 *  - Each kind goes to its own officers: savings to savings officers, loans
 *    to loan officers, never across.
 *  - Approving claims the application first so it cannot profile anyone
 *    twice, puts it back if profiling fails, can link an existing customer
 *    instead, and accepts a loan's guarantors with it.
 *  - A guarantor's link ties them to the application, and an application
 *    takes no more than two.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'off-1', email: 'o@x.com', roleCode: 'SAVINGS_OFFICER', permissions: ['SAVINGS:CREATE'] } as any,
  scope: 'br-1' as string | null,
  response: null as any,
  claimCount: 1,
  createFails: false,
  created: [] as any[],
  updates: [] as any[],
  existingCustomer: null as any,
  // submitFormResponse
  form: null as any,
  target: null as any,
  saved: [] as any[],
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    formResponse: {
      findUnique: vi.fn(async (args: any) => (args.where.reference ? h.target : h.response)),
      updateMany: vi.fn(async (args: any) => {
        h.updates.push({ kind: 'updateMany', ...args });
        return { count: args.where.guarantorForId ? 2 : h.claimCount };
      }),
      update: vi.fn(async (args: any) => { h.updates.push({ kind: 'update', ...args }); return {}; }),
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: any) => { h.saved.push(args.data); return { id: 'resp-new', reference: args.data.reference ?? null }; }),
    },
    customer: { findFirst: vi.fn(async () => h.existingCustomer) },
    branch: { findFirst: vi.fn(async () => ({ id: 'br-2' })) },
    form: {
      findUnique: vi.fn(async () => h.form),
      findFirst: vi.fn(async () => ({ slug: 'guarantor-abc123' })),
    },
    staff: { findMany: vi.fn(async () => []) },
    // No fee set by an admin yet: the paper forms' fees apply (lib/fees DEFAULT_FEES).
    applicationFee: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: any) => fn({
      formResponse: { update: vi.fn(async (args: any) => { h.updates.push({ kind: 'tx-update', ...args }); return {}; }) },
    })),
  },
}));
vi.mock('@/lib/auth-utils', () => ({ getSession: vi.fn(async () => ({ user: h.user })) }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications', () => ({ createNotificationForUsers: vi.fn(async () => undefined) }));
vi.mock('@/lib/customer-auth', () => ({ provisionCustomerLogin: vi.fn(async () => undefined) }));
vi.mock('@vercel/blob', () => ({ del: vi.fn() }));
vi.mock('@/lib/branch-scope', async (orig) => ({
  ...(await orig<typeof import('@/lib/branch-scope')>()),
  branchScopeFor: vi.fn(async () => h.scope),
}));
vi.mock('@/lib/utils', async (orig) => ({
  ...(await orig<typeof import('@/lib/utils')>()),
  generateReference: vi.fn(async () => 'CUS0042'),
}));
vi.mock('@/lib/customer-registration', async (orig) => ({
  ...(await orig<typeof import('@/lib/customer-registration')>()),
  createCustomerInTx: vi.fn(async (_tx: any, input: any, ctx: any) => {
    if (h.createFails) throw new Error('database unavailable');
    h.created.push({ input, ctx });
    return { id: 'cus-new', customerNumber: ctx.customerNumber };
  }),
}));

import { approveApplication, rejectApplication } from '@/actions/application.actions';
import { submitFormResponse } from '@/actions/form.actions';
import {
  CUSTOMER_PURPOSES, LOCKED_FIELDS, customerFormTemplate, enforceCustomerFields, applicantDetails, applicationTerms,
  monthsIn, fixedDepositTerms, makeReference, normalizeReference, pickSavingsPlan, reviewablePurposes, phoneKey,
  isLockedField, FD_PLANS,
} from '@/lib/customer-forms';
import { normalizeQuestions, validateAnswers } from '@/lib/forms';

beforeEach(() => {
  h.user = { id: 'off-1', email: 'o@x.com', roleCode: 'SAVINGS_OFFICER', permissions: ['SAVINGS:CREATE'] };
  h.scope = 'br-1';
  h.claimCount = 1;
  h.createFails = false;
  h.created = [];
  h.updates = [];
  h.existingCustomer = null;
  h.saved = [];
  h.target = null;
  h.response = {
    id: 'app-1',
    reference: 'SV-ABC234',
    onboardingStatus: 'PENDING',
    answers: { firstName: 'Ada', lastName: 'Obi', phone: '08031234567', address: '24 Agip Estate', idType: 'National ID (NIN)', idNumber: '12345678901' },
    form: { purpose: 'SAVINGS_APPLICATION', branchId: null },
  };
});

const typed = { firstName: 'Ada', lastName: 'Obi', phone: '08031234567', email: '', address: '24 Agip Estate' };

// ─── The forms ──────────────────────────────────────────────────────────────

describe('the ready-made forms', () => {
  it.each(CUSTOMER_PURPOSES)('%s holds every locked question and is a valid form', (purpose) => {
    const questions = customerFormTemplate(purpose);
    const ids = questions.map((q) => q.id);
    for (const f of LOCKED_FIELDS[purpose]) expect(ids).toContain(f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => normalizeQuestions(questions)).not.toThrow();
  });

  it('puts back a removed question and restores a retyped one, keeping it required', () => {
    const template = customerFormTemplate('LOAN_APPLICATION');
    const edited = template
      .filter((q) => q.id !== 'amount')
      .map((q) => (q.id === 'tenure' ? { ...q, type: 'SHORT_TEXT' as const, required: false, label: 'How long?' } : q));
    const fixed = enforceCustomerFields('LOAN_APPLICATION', edited);
    const amount = fixed.find((q) => q.id === 'amount')!;
    const tenure = fixed.find((q) => q.id === 'tenure')!;
    expect(amount).toMatchObject({ type: 'NUMBER', required: true });
    expect(tenure).toMatchObject({ type: 'NUMBER', required: true, label: 'How long?' });
  });

  it('keeps the fixed deposit contract choices exactly as the paper form', () => {
    const fixed = enforceCustomerFields('FIXED_DEPOSIT_APPLICATION', [
      { id: 'plan', type: 'MULTIPLE_CHOICE', label: 'Duration', required: false, options: ['1 month (90%)'] },
    ]);
    expect(fixed.find((q) => q.id === 'plan')?.options).toEqual(FD_PLANS.map((p) => p.label));
  });

  it('lets staff remove the questions approval does not read', () => {
    expect(isLockedField('SAVINGS_APPLICATION', 'amount')).toBe(true);
    const religion = customerFormTemplate('SAVINGS_APPLICATION').find((q) => q.label === 'Religion')!;
    expect(isLockedField('SAVINGS_APPLICATION', religion.id)).toBe(false);
  });

  it('refuses a loan application without its agreements ticked', () => {
    const questions = customerFormTemplate('LOAN_APPLICATION');
    const result = validateAnswers(questions, { firstName: 'Ada', lastName: 'Obi', phone: '08031234567', address: 'x', amount: 1000, loanPurpose: 'Stock', tenure: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toHaveLength(3);
  });
});

describe('reading the answers', () => {
  it('files the ID number under its kind and reads gender', () => {
    const d = applicantDetails({ firstName: ' Ada ', lastName: 'Obi', phone: '0803', address: 'x', gender: 'Female', idType: "Driver's licence", idNumber: 'ABC123', email: 'ADA@X.COM' });
    expect(d).toMatchObject({ firstName: 'Ada', gender: 'FEMALE', driversLicense: 'ABC123', email: 'ada@x.com' });
    expect(d.nationalId).toBeUndefined();
    expect(applicantDetails({ idType: "Voter's card", idNumber: 'V1' })).toMatchObject({ idType: "Voter's card", idNumber: 'V1' });
  });

  it('reads the terms each kind asks for', () => {
    expect(applicationTerms('FIXED_DEPOSIT_APPLICATION', { plan: '12 months (30%)', amount: 1_500_000 })).toMatchObject({
      amount: 1_500_000, plan: { months: 12, totalRate: 30 }, durationMonths: 12,
    });
    expect(applicationTerms('PARTNERSHIP_APPLICATION', { amount: 200_000 }).plan).toMatchObject({ months: 5, totalRate: 20 });
    expect(applicationTerms('SAVINGS_APPLICATION', { duration: '1 year' }).durationMonths).toBe(12);
    expect(applicationTerms('LOAN_APPLICATION', { amount: '₦300,000', tenure: 3, loanPurpose: 'Stock' })).toMatchObject({
      amount: 300_000, tenureMonths: 3, loanPurpose: 'Stock',
    });
  });

  it('understands durations the way people write them', () => {
    expect(monthsIn('6 months')).toBe(6);
    expect(monthsIn('6')).toBe(6);
    expect(monthsIn('one year')).toBe(12);
    expect(monthsIn('2yrs')).toBe(24);
    expect(monthsIn('until christmas')).toBeNull();
  });

  it('turns a total-for-the-term rate into what the deposit engine pays the same total on', () => {
    const start = new Date('2026-10-07T00:00:00Z');
    for (const plan of FD_PLANS) {
      const { tenureDays, annualRate } = fixedDepositTerms(plan, start);
      // The engine: interest = P × rate × days / 365 / 100.
      const paid = (annualRate * tenureDays) / 365;
      expect(Math.abs(paid - plan.totalRate)).toBeLessThan(0.01);
    }
    expect(fixedDepositTerms(FD_PLANS[0], start).tenureDays).toBe(182);
  });

  it('matches phone numbers however they were written', () => {
    expect(phoneKey('+234 803 123 4567')).toBe(phoneKey('08031234567'));
    expect(phoneKey('123')).toBeNull();
  });

  it('picks the plan asked for, and only when it is clear-cut', () => {
    const plans = [
      { id: 'p6', name: 'Fixed 6', durationMonths: 6, totalInterestRate: 17 },
      { id: 'p12', name: 'Fixed 12', durationMonths: 12, totalInterestRate: 36 },
      { id: 'p12b', name: 'Fixed 12 promo', durationMonths: 12, totalInterestRate: 40 },
      { id: 'mp', name: 'Mutual Partnership', durationMonths: 5, totalInterestRate: 20 },
    ];
    expect(pickSavingsPlan(plans, { partnership: true, durationMonths: 5, totalRate: 20 })?.id).toBe('mp');
    expect(pickSavingsPlan(plans, { partnership: false, durationMonths: 6, totalRate: null })?.id).toBe('p6');
    expect(pickSavingsPlan(plans, { partnership: false, durationMonths: 12, totalRate: null })).toBeNull();
    expect(pickSavingsPlan(plans, { partnership: false, durationMonths: null, totalRate: null })).toBeNull();
  });
});

describe('references', () => {
  it('reads back a reference however it was typed', () => {
    const ref = makeReference('LOAN_APPLICATION');
    expect(ref).toMatch(/^LA-[A-Z2-9]{6}$/);
    expect(normalizeReference(ref.toLowerCase().replace('-', ' '))).toBe(ref);
    expect(normalizeReference('LA-12')).toBeNull();
    expect(normalizeReference(undefined)).toBeNull();
  });
});

describe('who reviews what', () => {
  it('sends each kind to its own officers', () => {
    expect(reviewablePurposes({ permissions: ['SAVINGS:CREATE', 'CUSTOMERS:READ'] })).toEqual(['SAVINGS_APPLICATION', 'PARTNERSHIP_APPLICATION']);
    expect(reviewablePurposes({ permissions: ['LOANS:CREATE', 'SAVINGS:READ'] })).toEqual(['LOAN_APPLICATION']);
    expect(reviewablePurposes({ permissions: ['FIXED_DEPOSITS:CREATE'] })).toEqual(['FIXED_DEPOSIT_APPLICATION']);
    expect(reviewablePurposes({ permissions: ['SAVINGS:APPROVE', 'LOANS:MANAGE_ALL', 'FIXED_DEPOSITS:MANAGE'] })).toHaveLength(4);
    expect(reviewablePurposes({ permissions: ['ACCOUNTS:REPORTS_VIEW', 'LOANS:READ', 'SAVINGS:READ'] })).toEqual([]);
  });
});

// ─── Approving ──────────────────────────────────────────────────────────────

describe('approving an application', () => {
  it('profiles a new customer in the officer\'s branch and sends them to open the account', async () => {
    const result = await approveApplication({ responseId: 'app-1', details: typed });
    expect(result).toMatchObject({ success: true, data: { customerId: 'cus-new', nextUrl: '/savings/create?application=app-1' } });
    expect(h.created[0].ctx).toMatchObject({ branchId: 'br-1', customerNumber: 'CUS0042' });
    expect(h.created[0].input).toMatchObject({ firstName: 'Ada', nationalId: '12345678901' });
    expect(h.updates[0]).toMatchObject({ kind: 'updateMany', where: { id: 'app-1', onboardingStatus: 'PENDING' }, data: { onboardingStatus: 'APPROVED' } });
  });

  it('keeps the officer\'s corrections over what was typed on the form', async () => {
    await approveApplication({ responseId: 'app-1', details: { ...typed, firstName: 'Adaeze', email: 'ADA@X.COM' } });
    expect(h.created[0].input).toMatchObject({ firstName: 'Adaeze', email: 'ada@x.com' });
  });

  it('refuses an officer of another product', async () => {
    h.user = { ...h.user, permissions: ['LOANS:CREATE'] };
    const result = await approveApplication({ responseId: 'app-1', details: typed });
    expect(result).toMatchObject({ success: false, error: 'Permission denied' });
    expect(h.updates).toEqual([]);
  });

  it('cannot profile anyone twice when two officers approve at once', async () => {
    h.claimCount = 0;
    const result = await approveApplication({ responseId: 'app-1', details: typed });
    expect(result.success).toBe(false);
    expect(h.created).toEqual([]);
  });

  it('puts the application back in the queue when profiling fails', async () => {
    h.createFails = true;
    const result = await approveApplication({ responseId: 'app-1', details: typed });
    expect(result).toMatchObject({ success: false, error: 'database unavailable' });
    expect(h.updates.at(-1)).toMatchObject({ kind: 'update', data: { onboardingStatus: 'PENDING', reviewedById: null } });
  });

  it('links an existing customer instead of making a second profile', async () => {
    h.existingCustomer = { id: 'cus-7', customerNumber: 'CUS0007' };
    const result = await approveApplication({ responseId: 'app-1', details: typed, existingCustomerId: 'cus-7' });
    expect(result).toMatchObject({ success: true, data: { customerId: 'cus-7' } });
    expect(h.created).toEqual([]);
    expect(h.updates.at(-1)).toMatchObject({ kind: 'update', data: { customerId: 'cus-7' } });
  });

  it('makes senior staff, who have no single branch, choose one', async () => {
    h.scope = null;
    h.user = { ...h.user, permissions: ['SAVINGS:APPROVE'] };
    expect(await approveApplication({ responseId: 'app-1', details: typed })).toMatchObject({ success: false, error: 'Choose the branch this customer belongs to' });
    expect(await approveApplication({ responseId: 'app-1', details: typed, branchId: 'br-2' })).toMatchObject({ success: true });
    expect(h.created[0].ctx.branchId).toBe('br-2');
  });

  it('hides another branch\'s applications', async () => {
    h.response.form.branchId = 'br-9';
    expect(await approveApplication({ responseId: 'app-1', details: typed })).toMatchObject({ success: false, error: 'Application not found' });
  });

  it('accepts a loan\'s waiting guarantors with it', async () => {
    h.user = { ...h.user, permissions: ['LOANS:CREATE'] };
    h.response.form.purpose = 'LOAN_APPLICATION';
    const result = await approveApplication({ responseId: 'app-1', details: typed });
    expect(result).toMatchObject({ success: true, data: { nextUrl: '/loans/new?application=app-1' } });
    expect(h.updates).toContainEqual(expect.objectContaining({
      kind: 'updateMany', where: { guarantorForId: 'app-1', onboardingStatus: 'PENDING' }, data: expect.objectContaining({ onboardingStatus: 'APPROVED' }),
    }));
  });

  it('rejects with a note, creating nothing', async () => {
    const result = await rejectApplication('app-1', '  Duplicate  ');
    expect(result.success).toBe(true);
    expect(h.updates[0]).toMatchObject({ data: { onboardingStatus: 'REJECTED', reviewNote: 'Duplicate' } });
  });
});

// ─── Guarantors ─────────────────────────────────────────────────────────────

describe('a guarantor\'s form', () => {
  // Built once per test: a template's own questions get fresh random ids each time.
  let questions = customerFormTemplate('GUARANTOR');
  const guarantorForm = () => ({
    id: 'form-g', slug: 'guarantor-abc123', status: 'OPEN', closesAt: null, audience: 'PUBLIC', purpose: 'GUARANTOR',
    branchId: null, confirmationMessage: 'Thanks', questions,
  });
  const answers = () => {
    const a: Record<string, unknown> = {
      firstName: 'Godsent', lastName: 'Ramsey', phone: '08012345678', address: 'No. 24 Agip Estate',
      relationship: 'Son', occupation: 'Trader', employerAddress: 'Mile 1 market',
    };
    const declaration = questions.find((q) => q.label === 'Declaration')!;
    a[declaration.id] = declaration.options;
    return a;
  };
  const loanApp = (guarantors: number) => ({
    id: 'app-9', answers: { firstName: 'Kuebari', lastName: 'Gift', amount: 500000 }, onboardingStatus: 'PENDING',
    form: { purpose: 'LOAN_APPLICATION' }, _count: { guarantors },
  });

  beforeEach(() => {
    questions = customerFormTemplate('GUARANTOR');
    h.form = guarantorForm();
  });

  it('attaches to the application named on the link', async () => {
    h.target = loanApp(1);
    const result = await submitFormResponse('guarantor-abc123', answers(), '', 'la-abc234');
    expect(result).toMatchObject({ success: true, data: { guaranteeing: 'Kuebari Gift' } });
    expect(h.saved[0]).toMatchObject({ guarantorForId: 'app-9', onboardingStatus: 'PENDING' });
    expect(h.saved[0].reference).toMatch(/^GR-/);
    expect(h.saved[0]).toMatchObject({ feeDue: 2000, feeBasis: 'Registration fee' });
  });

  it('turns away a third guarantor', async () => {
    h.target = loanApp(2);
    const result = await submitFormResponse('guarantor-abc123', answers(), '', 'LA-ABC234');
    expect(result.success).toBe(false);
    expect(h.saved).toEqual([]);
  });

  it('refuses an application number that is not a loan application', async () => {
    h.target = { ...loanApp(0), form: { purpose: 'SAVINGS_APPLICATION' } };
    const result = await submitFormResponse('guarantor-abc123', answers(), '', 'LA-ABC234');
    expect(result.success).toBe(false);
  });

  it('waits unattached when the guarantor has no application number', async () => {
    const result = await submitFormResponse('guarantor-abc123', answers(), '', '');
    expect(result.success).toBe(true);
    expect(h.saved[0]).toMatchObject({ guarantorForId: null });
  });

  it('gives a loan applicant the guarantor link carrying their reference', async () => {
    const loanQuestions = customerFormTemplate('LOAN_APPLICATION');
    h.form = { ...guarantorForm(), id: 'form-l', slug: 'loan-xyz', purpose: 'LOAN_APPLICATION', questions: loanQuestions };
    const loan: Record<string, unknown> = { firstName: 'Kuebari', lastName: 'Gift', phone: '08031234567', address: 'x', amount: 500000, loanPurpose: 'Stock', tenure: 3 };
    for (const q of loanQuestions.filter((x) => x.type === 'CHECKBOXES')) loan[q.id] = q.options;
    const result = await submitFormResponse('loan-xyz', loan, '');
    expect(result.success).toBe(true);
    const ref = result.data?.reference;
    expect(ref).toMatch(/^LA-/);
    expect(result.data?.guarantorPath).toBe(`/f/guarantor-abc123?app=${ref}`);
    // The 7% processing fee, fixed when the form was submitted.
    expect(h.saved[0]).toMatchObject({ feeDue: 35_000 });
    expect(result.data?.fee).toMatchObject({ due: 35_000 });
  });
});
