/**
 * Staff work from the company's forms; form managers build them.
 *
 * The lines this file holds:
 *  - Only form managers (level 85+ or the superuser) create forms, so staff
 *    share the company's savings, loan, fixed deposit and guarantor forms
 *    rather than making copies.
 *  - A form a staff member made earlier (marked personal) stays theirs alone,
 *    and an application through it is credited to them.
 *  - Only a manager's staff form is announced to every staff member.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as any,
  form: null as any,
  findManyWhere: null as any,
  created: null as any,
  updated: null as any,
  notified: [] as string[][],
  creator: null as any,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    form: {
      findUnique: vi.fn(async () => h.form),
      findMany: vi.fn(async ({ where }: any) => { h.findManyWhere = where; return []; }),
      create: vi.fn(async ({ data }: any) => { h.created = data; return { id: 'new-form', ...data }; }),
      update: vi.fn(async ({ data }: any) => { h.updated = data; return { ...h.form, ...data }; }),
      delete: vi.fn(async () => h.form),
    },
    staff: {
      findUnique: vi.fn(async () => ({ branchId: 'branch-ikeja' })),
      findFirst: vi.fn(async () => h.creator),
      findMany: vi.fn(async () => [{ id: 'everyone-1' }, { id: 'everyone-2' }]),
    },
    feePayment: { count: vi.fn(async () => 0) },
    formResponse: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.session) }));
vi.mock('@/lib/auth-utils', () => ({ getSession: vi.fn(async () => h.session) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications', () => ({
  createNotificationForUsers: vi.fn(async (ids: string[]) => { h.notified.push(ids); }),
}));
vi.mock('@vercel/blob', () => ({ del: vi.fn(async () => undefined) }));

import {
  getForms, saveForm, createCustomerForm, createOnboardingForm, setFormStatus, deleteForm, getPublicForm,
} from '@/actions/form.actions';

const staff = { user: { id: 'staff-1', firstName: 'Ada', lastName: 'Obi', permissions: [], roleLevel: 40, userType: 'staff' } };
const manager = { user: { id: 'gm-1', firstName: 'Gee', lastName: 'Em', permissions: [], roleLevel: 85, userType: 'staff' } };

const form = (over: Record<string, unknown> = {}) => ({
  id: 'form-1', slug: 'savings-abc', title: 'Savings', description: null, audience: 'PUBLIC', status: 'DRAFT',
  purpose: 'GENERAL', closesAt: null, publishedAt: null, personal: true, createdById: 'staff-1', branchId: null,
  questions: [{ id: 'q', type: 'SHORT_TEXT', label: 'Name', required: true }], ...over,
});

beforeEach(() => {
  h.session = staff;
  h.form = form();
  h.findManyWhere = null;
  h.created = null;
  h.updated = null;
  h.notified = [];
  h.creator = null;
});

describe('who sees which forms', () => {
  it('shows a staff member only their own forms', async () => {
    await getForms();
    expect(h.findManyWhere).toEqual({ createdById: 'staff-1' });
  });

  it('shows a form manager every form', async () => {
    h.session = manager;
    await getForms();
    expect(h.findManyWhere).toEqual({});
  });

  it("refuses a staff member another's form", async () => {
    h.form = form({ createdById: 'someone-else' });
    expect((await saveForm({ title: 'X', audience: 'PUBLIC', questions: [] }, 'form-1')).error).toBe('Form not found');
    expect((await deleteForm('form-1')).error).toBe('Form not found');
    expect((await setFormStatus('form-1', 'OPEN')).error).toBe('Form not found');
  });
});

describe('making forms', () => {
  it('is for form managers only', async () => {
    expect((await saveForm({ title: 'My survey', audience: 'PUBLIC', questions: [] })).success).toBe(false);
    expect((await createCustomerForm('SAVINGS_APPLICATION')).success).toBe(false);
    expect((await createOnboardingForm()).success).toBe(false);
    expect(h.created).toBeNull();
  });

  it("makes a manager's form a company form", async () => {
    h.session = manager;
    expect((await saveForm({ title: 'Company survey', audience: 'PUBLIC', questions: [] })).success).toBe(true);
    expect(h.created.personal).toBe(false);
    expect((await createCustomerForm('GUARANTOR')).success).toBe(true);
  });
});

describe('opening a staff form', () => {
  it("does not announce a staff member's own staff form to everyone", async () => {
    h.form = form({ audience: 'STAFF' });
    expect((await setFormStatus('form-1', 'OPEN')).success).toBe(true);
    expect(h.notified).toEqual([]);
  });

  it("announces a manager's staff form", async () => {
    h.session = manager;
    h.form = form({ audience: 'STAFF', createdById: 'gm-1', personal: false });
    await setFormStatus('form-1', 'OPEN');
    expect(h.notified).toHaveLength(1);
  });
});

describe('credit for applications', () => {
  it("names the maker of a staff member's own customer form as the referrer", async () => {
    h.session = null;
    h.form = form({ status: 'OPEN', purpose: 'SAVINGS_APPLICATION' });
    h.creator = { id: 'staff-1', firstName: 'Ada', lastName: 'Obi', employeeId: 'EMP001' };
    const state = await getPublicForm('savings-abc');
    expect(state.state).toBe('open');
    expect(state.state === 'open' && state.sharedBy).toBe('Ada Obi');
  });

  it('names no one on a company form opened without a link', async () => {
    h.session = null;
    h.form = form({ status: 'OPEN', purpose: 'SAVINGS_APPLICATION', personal: false });
    h.creator = { id: 'gm-1', firstName: 'Gee', lastName: 'Em', employeeId: 'EMP002' };
    const state = await getPublicForm('savings-abc');
    expect(state.state === 'open' && state.sharedBy).toBeNull();
  });
});
