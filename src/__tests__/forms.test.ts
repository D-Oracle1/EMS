/**
 * Forms.
 *
 * The lines this file holds:
 *  - Only admins (level 85+ or the superuser) build forms and read responses.
 *  - A question list is cleaned before it is saved: unknown types, empty
 *    questions and choice questions without options are refused.
 *  - An answer is checked against the form's own questions, on the page and
 *    again on the server; anything not on the form is dropped.
 *  - A draft is invisible to the public, a staff form refuses a signed-out
 *    visitor, a closed form takes nothing, a honeypot submission is swallowed
 *    and "one response per person" holds.
 *  - The CSV export cannot smuggle a spreadsheet formula.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as any,
  form: null as any,
  existing: null as any,
  recent: 0,
  created: null as any,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    form: { findUnique: vi.fn(async () => h.form) },
    formResponse: {
      findFirst: vi.fn(async () => h.existing),
      count: vi.fn(async () => h.recent),
      create: vi.fn(async ({ data }: any) => { h.created = data; return { id: 'resp-1', ...data }; }),
    },
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.session) }));
vi.mock('@/lib/auth-utils', () => ({ getSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications', () => ({ createNotificationForUsers: vi.fn(async () => undefined) }));

import { getPublicForm, submitFormResponse } from '@/actions/form.actions';
import {
  canManageForms, normalizeQuestions, validateAnswers, summarize, responsesCsv, makeSlug,
  isAcceptingResponses, type FormQuestion, type Answers,
} from '@/lib/forms';

const questions: FormQuestion[] = [
  { id: 'name', type: 'SHORT_TEXT', label: 'Full name', required: true },
  { id: 'email', type: 'EMAIL', label: 'Email', required: true },
  { id: 'branch', type: 'MULTIPLE_CHOICE', label: 'Branch', required: false, options: ['Ikeja', 'Lekki'] },
  { id: 'tools', type: 'CHECKBOXES', label: 'Tools', required: false, options: ['Excel', 'Word', 'Email'] },
  { id: 'rate', type: 'SCALE', label: 'Rating', required: false, scaleMin: 1, scaleMax: 5 },
  { id: 'age', type: 'NUMBER', label: 'Age', required: false },
  { id: 'dob', type: 'DATE', label: 'Date of birth', required: false },
  { id: 'phone', type: 'PHONE', label: 'Phone', required: false },
];

const openForm = (over: Record<string, unknown> = {}) => ({
  id: 'form-1', slug: 'survey-abc123', title: 'Staff survey', description: null,
  audience: 'PUBLIC', status: 'OPEN', closesAt: null, oneResponsePerStaff: false,
  confirmationMessage: 'Thanks!', questions, ...over,
});

const staff = { user: { id: 'staff-1', firstName: 'Ada', lastName: 'Obi', permissions: [], roleLevel: 40, userType: 'staff' } };
const admin = { user: { id: 'gm-1', firstName: 'Gee', lastName: 'Em', permissions: [], roleLevel: 85, userType: 'staff' } };
const customer = { user: { id: 'cust-1', firstName: 'Cu', lastName: 'St', permissions: [], userType: 'customer' } };

const good = { name: 'Ada Obi', email: 'ADA@Example.com ', branch: 'Lekki', tools: ['Email', 'Excel'], rate: 4 };

beforeEach(() => {
  h.session = null;
  h.form = openForm();
  h.existing = null;
  h.recent = 0;
  h.created = null;
});

describe('who manages forms', () => {
  it('is the superuser or level 85 and above', () => {
    expect(canManageForms({ permissions: ['ADMIN:SYSTEM'], roleLevel: 10 })).toBe(true);
    expect(canManageForms({ permissions: [], roleLevel: 85 })).toBe(true);
    expect(canManageForms({ permissions: ['SYSTEM:CONFIG_MANAGE'], roleLevel: 80 })).toBe(false);
  });
});

describe('normalizeQuestions', () => {
  it('trims, de-duplicates options and keeps stable ids', () => {
    const [q] = normalizeQuestions([{ id: 'q1', type: 'DROPDOWN', label: '  Branch ', options: ['A', ' A', '', 'B'], required: true }]);
    expect(q).toEqual({ id: 'q1', type: 'DROPDOWN', label: 'Branch', required: true, options: ['A', 'B'] });
  });

  it('refuses an empty question, an unknown type and a choice without options', () => {
    expect(() => normalizeQuestions([{ type: 'SHORT_TEXT', label: ' ' }])).toThrow(/needs a question/);
    expect(() => normalizeQuestions([{ type: 'MAGIC', label: 'x' }])).toThrow(/unknown type/);
    expect(() => normalizeQuestions([{ type: 'CHECKBOXES', label: 'x', options: [''] }])).toThrow(/at least one option/);
  });

  it('replaces a repeated id so answers never collide', () => {
    const qs = normalizeQuestions([
      { id: 'same', type: 'SHORT_TEXT', label: 'a' },
      { id: 'same', type: 'SHORT_TEXT', label: 'b' },
    ]);
    expect(qs[0].id).toBe('same');
    expect(qs[1].id).not.toBe('same');
  });

  it('bounds a linear scale to end between 2 and 10', () => {
    expect(() => normalizeQuestions([{ type: 'SCALE', label: 'x', scaleMax: 11 }])).toThrow(/between 2 and 10/);
    expect(normalizeQuestions([{ type: 'SCALE', label: 'x', scaleMin: 0, scaleMax: 10 }])[0]).toMatchObject({ scaleMin: 0, scaleMax: 10 });
  });
});

describe('validateAnswers', () => {
  it('accepts good answers, cleaned and in option order, dropping strangers', () => {
    const result = validateAnswers(questions, { ...good, injected: 'x' });
    expect(result).toEqual({
      ok: true,
      answers: { name: 'Ada Obi', email: 'ada@example.com', branch: 'Lekki', tools: ['Excel', 'Email'], rate: 4 },
    });
  });

  it('names every failing question', () => {
    const result = validateAnswers(questions, {
      email: 'not-an-email', branch: 'Abuja', tools: ['Excel', 'Hacking'], rate: 9, age: 'old', dob: '2026-13-45', phone: '12',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['age', 'branch', 'dob', 'email', 'name', 'phone', 'rate', 'tools']);
      expect(result.errors.name).toMatch(/required/);
    }
  });

  it('leaves optional questions out when unanswered', () => {
    const result = validateAnswers(questions, { name: 'A', email: 'a@b.co', tools: [] });
    expect(result).toEqual({ ok: true, answers: { name: 'A', email: 'a@b.co' } });
  });
});

describe('isAcceptingResponses', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  it('needs the form open and before its deadline', () => {
    expect(isAcceptingResponses({ status: 'OPEN', closesAt: null }, now)).toBe(true);
    expect(isAcceptingResponses({ status: 'OPEN', closesAt: '2026-10-03T11:59:00Z' }, now)).toBe(false);
    expect(isAcceptingResponses({ status: 'CLOSED', closesAt: null }, now)).toBe(false);
    expect(isAcceptingResponses({ status: 'DRAFT', closesAt: null }, now)).toBe(false);
  });
});

describe('summaries and export', () => {
  const responses: Answers[] = [
    { name: 'A', tools: ['Excel', 'Email'], rate: 5, age: 30 },
    { name: 'B', tools: ['Excel'], rate: 3, age: 40 },
    { name: 'C', rate: 4 },
  ];

  it('tallies choices, averages scales and numbers, lists text', () => {
    expect(summarize(questions[3], responses)).toEqual({
      kind: 'choices', answered: 2,
      counts: [{ option: 'Excel', count: 2 }, { option: 'Word', count: 0 }, { option: 'Email', count: 1 }],
    });
    expect(summarize(questions[4], responses)).toMatchObject({ kind: 'scale', answered: 3, average: 4 });
    expect(summarize(questions[5], responses)).toEqual({ kind: 'number', answered: 2, average: 35, min: 30, max: 40 });
    expect(summarize(questions[0], responses)).toEqual({ kind: 'text', answered: 3, latest: ['A', 'B', 'C'] });
  });

  it('quotes cells and defuses formulas but keeps negative numbers', () => {
    const csv = responsesCsv(
      [questions[0], questions[5]],
      [{ submittedAt: '2026-10-03T10:00:00.000Z', respondent: null, answers: { name: '=HYPERLINK("x")', age: -5 } }]
    );
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('Submitted,Respondent,Full name,Age');
    expect(row).toBe(`2026-10-03T10:00:00.000Z,Anonymous,"'=HYPERLINK(""x"")",-5`);
  });

  it('makes a readable, unguessable slug', () => {
    expect(makeSlug('Staff Survey: Q4 2026!', 'k3j9x2')).toBe('staff-survey-q4-2026-k3j9x2');
    expect(makeSlug('!!!', 'k3j9x2')).toBe('k3j9x2');
  });
});

describe('the share link', () => {
  it('hides a draft from everyone but an admin, who gets a preview', async () => {
    h.form = openForm({ status: 'DRAFT' });
    expect(await getPublicForm('survey-abc123')).toEqual({ state: 'not-found' });
    h.session = staff;
    expect(await getPublicForm('survey-abc123')).toEqual({ state: 'not-found' });
    h.session = admin;
    expect(await getPublicForm('survey-abc123')).toMatchObject({ state: 'open', preview: true });
  });

  it('asks a signed-out visitor, or a customer, to sign in for a staff form', async () => {
    h.form = openForm({ audience: 'STAFF' });
    expect(await getPublicForm('survey-abc123')).toMatchObject({ state: 'login' });
    h.session = customer;
    expect(await getPublicForm('survey-abc123')).toMatchObject({ state: 'login' });
    h.session = staff;
    expect(await getPublicForm('survey-abc123')).toMatchObject({ state: 'open', preview: false, respondent: 'Ada Obi' });
  });

  it('says a closed form is closed', async () => {
    h.form = openForm({ status: 'CLOSED' });
    expect(await getPublicForm('survey-abc123')).toMatchObject({ state: 'closed' });
  });
});

describe('submitFormResponse', () => {
  it('records a public response with no session', async () => {
    const result = await submitFormResponse('survey-abc123', good);
    expect(result).toEqual({ success: true, message: 'Thanks!' });
    expect(h.created).toMatchObject({ formId: 'form-1', staffId: null, answers: { email: 'ada@example.com' } });
  });

  it('names the staff member who answers', async () => {
    h.session = staff;
    await submitFormResponse('survey-abc123', good);
    expect(h.created.staffId).toBe('staff-1');
  });

  it('swallows a honeypot submission without saving it', async () => {
    const result = await submitFormResponse('survey-abc123', good, 'http://spam.example');
    expect(result.success).toBe(true);
    expect(h.created).toBeNull();
  });

  it('returns the failing questions and saves nothing', async () => {
    const result = await submitFormResponse('survey-abc123', { name: '' });
    expect(result.success).toBe(false);
    expect(Object.keys(result.data!.errors!)).toEqual(['name', 'email']);
    expect(h.created).toBeNull();
  });

  it('refuses drafts, closed forms and a flood', async () => {
    h.form = openForm({ status: 'DRAFT' });
    expect((await submitFormResponse('survey-abc123', good)).success).toBe(false);
    h.form = openForm({ closesAt: new Date(Date.now() - 1000) });
    expect((await submitFormResponse('survey-abc123', good)).error).toMatch(/no longer/);
    h.form = openForm();
    h.recent = 60;
    expect((await submitFormResponse('survey-abc123', good)).error).toMatch(/busy/);
    expect(h.created).toBeNull();
  });

  it('keeps staff forms to staff, once each when set', async () => {
    h.form = openForm({ audience: 'STAFF', oneResponsePerStaff: true });
    expect((await submitFormResponse('survey-abc123', good)).error).toMatch(/Sign in/);
    h.session = customer;
    expect((await submitFormResponse('survey-abc123', good)).error).toMatch(/Sign in/);
    h.session = staff;
    h.existing = { id: 'earlier' };
    expect((await submitFormResponse('survey-abc123', good)).error).toMatch(/already responded/);
    h.existing = null;
    expect((await submitFormResponse('survey-abc123', good)).success).toBe(true);
  });
});
