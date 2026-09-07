/**
 * Departmental navigation access.
 *
 * The rule this file defends: a department sees its own work and nothing else.
 * A savings officer must never see lending, HR or the website; a loan officer
 * must never see savings operations; IT owns the website and touches no
 * customer, money or people data.
 *
 * The permission sets below mirror prisma/seed.ts. If a role's permissions
 * change there without a matching change here, these tests fail — which is the
 * point: nav exposure is part of the role definition, not an afterthought.
 */
import { describe, it, expect } from 'vitest';
import { resolveNav, visibleSections, navItems, canSee } from '@/lib/navigation';
import { resolveLandingPath, isCmsFocused } from '@/lib/landing';

// ── Seeded role permission sets ─────────────────────────────────────────────

const ALL_PERMISSIONS = Array.from(
  new Set(
    navItems.flatMap((item) => [
      ...(item.permission ? [item.permission] : []),
      ...(item.permissions ?? []),
    ])
  )
);

const ROLES = {
  SAVINGS_OFFICER: [
    'CUSTOMERS:READ',
    'SAVINGS:READ', 'SAVINGS:CREATE', 'SAVINGS:TRANSACT',
    'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW',
    'FIXED_DEPOSITS:READ', 'FIXED_DEPOSITS:CREATE', 'FIXED_DEPOSITS:LIQUIDATE',
    'DOCUMENTS:READ',
  ],
  LOAN_OFFICER: [
    'CUSTOMERS:READ', 'CUSTOMERS:CREATE', 'CUSTOMERS:UPDATE',
    'LOANS:READ', 'LOANS:CREATE',
    'SAVINGS:READ',
    'DOCUMENTS:READ', 'DOCUMENTS:CREATE',
  ],
  VERIFICATION_OFFICER: [
    'LOANS:VERIFY',
    'CUSTOMERS:READ',
    'DOCUMENTS:READ', 'DOCUMENTS:CREATE',
    'VERIFICATION:READ', 'VERIFICATION:PROCESS',
  ],
  ACCOUNT_OFFICER: [
    'ACCOUNTS:COA_MANAGE', 'ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:REPORTS_VIEW',
    'ACCOUNTS:JOURNAL_POST', 'ACCOUNTS:JOURNAL_REVERSE', 'ACCOUNTS:PERIOD_CLOSE',
    'LOANS:READ', 'SAVINGS:READ', 'FIXED_DEPOSITS:READ',
    'DOCUMENTS:READ',
  ],
  HR_ADMIN: [
    'HR:STAFF_READ', 'HR:STAFF_CREATE', 'HR:STAFF_UPDATE',
    'HR:ATTENDANCE_MANAGE', 'HR:LEAVE_MANAGE', 'HR:PERFORMANCE_MANAGE',
    'HR:PAYROLL_READ', 'HR:PAYROLL_MANAGE',
    'HR:RECRUITMENT_MANAGE', 'HR:TRAINING_MANAGE', 'HR:ASSET_MANAGE',
    'HR:ANNOUNCE', 'HR:CONFIG_MANAGE', 'HR:ANALYTICS_VIEW',
    'DOCUMENTS:READ', 'DOCUMENTS:CREATE',
    'AUDIT:READ',
    'SYSTEM:USER_MANAGE',
  ],
  IT_ADMIN: [
    'CMS:READ', 'CMS:CONTENT_MANAGE', 'CMS:POST_MANAGE', 'CMS:PUBLISH',
    'AUDIT:READ',
    'SYSTEM:CONFIG_MANAGE',
    'DOCUMENTS:READ',
  ],
  SUPER_ADMIN: ALL_PERMISSIONS,
} as const;

const viewer = (role: keyof typeof ROLES) => ({ permissions: [...ROLES[role]] });

/** Every href a role can reach from the sidebar. */
function hrefsFor(role: keyof typeof ROLES): string[] {
  return resolveNav(viewer(role)).items.map((i) => i.href);
}

// ── Structural guarantees ───────────────────────────────────────────────────

describe('nav structure', () => {
  it('gives every entry a unique href', () => {
    const hrefs = navItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('only leaves personal entries ungated', () => {
    // An entry with no permission is visible to every employee, so it must be
    // the staff member's own record — never a department's module.
    const ungated = navItems.filter((i) => !i.permission && !i.permissions).map((i) => i.href);
    expect(ungated.sort()).toEqual(
      [
        '/dashboard',
        '/hr/announcements',
        '/hr/attendance',
        '/hr/leave',
        '/hr/my-payslips',
        '/hr/my-profile',
        '/notifications',
      ].sort()
    );
  });

  it('never renders a section heading above an empty run', () => {
    for (const role of Object.keys(ROLES) as Array<keyof typeof ROLES>) {
      const { items, headings } = resolveNav(viewer(role));
      const hrefs = new Set(items.map((i) => i.href));
      for (const href of headings.keys()) {
        expect(hrefs.has(href), `${role}: heading on hidden item ${href}`).toBe(true);
      }
    }
  });
});

// ── Savings officer ─────────────────────────────────────────────────────────

describe('savings officer', () => {
  const hrefs = hrefsFor('SAVINGS_OFFICER');

  it('sees savings and fixed deposits', () => {
    expect(hrefs).toContain('/savings');
    expect(hrefs).toContain('/savings/accounts');
    expect(hrefs).toContain('/savings/withdrawals');
    expect(hrefs).toContain('/fixed-deposits');
  });

  it('never sees lending', () => {
    expect(hrefs).not.toContain('/loans');
    expect(hrefs).not.toContain('/verification');
    expect(hrefs).not.toContain('/settings/loan-products');
    expect(visibleSections(viewer('SAVINGS_OFFICER'))).not.toContain('Lending');
  });

  it('never sees the HR module', () => {
    expect(hrefs).not.toContain('/hr');
    expect(hrefs).not.toContain('/hr/staff');
    expect(hrefs).not.toContain('/hr/payroll');
    expect(hrefs).not.toContain('/hr/recruitment');
    expect(visibleSections(viewer('SAVINGS_OFFICER'))).not.toContain('Human Resources');
  });

  it('never sees accounting, the website or admin', () => {
    expect(hrefs).not.toContain('/accounting');
    expect(hrefs).not.toContain('/reports');
    expect(hrefs).not.toContain('/cms/content');
    expect(hrefs).not.toContain('/settings/roles');
    expect(hrefs).not.toContain('/audit-logs');
  });

  it('still keeps their own payslip, leave and clock-in', () => {
    // Locking down HR must not take self-service away from the whole company.
    expect(hrefs).toContain('/hr/my-profile');
    expect(hrefs).toContain('/hr/my-payslips');
    expect(hrefs).toContain('/hr/attendance');
    expect(hrefs).toContain('/hr/leave');
    expect(visibleSections(viewer('SAVINGS_OFFICER'))).toContain('My Workspace');
  });
});

// ── Loan officer ────────────────────────────────────────────────────────────

describe('loan officer', () => {
  const hrefs = hrefsFor('LOAN_OFFICER');

  it('sees lending and customers', () => {
    expect(hrefs).toContain('/loans');
    expect(hrefs).toContain('/customers');
  });

  it('never sees the HR module', () => {
    expect(hrefs).not.toContain('/hr');
    expect(hrefs).not.toContain('/hr/staff');
    expect(hrefs).not.toContain('/hr/payroll');
    expect(visibleSections(viewer('LOAN_OFFICER'))).not.toContain('Human Resources');
  });

  it('never sees the savings module, despite holding SAVINGS:READ', () => {
    // SAVINGS:READ lets them view a customer's savings while assessing a loan.
    // It must not hand them the savings department in the sidebar.
    expect(hrefs).not.toContain('/savings');
    expect(hrefs).not.toContain('/savings/accounts');
    expect(hrefs).not.toContain('/savings/withdrawals');
    expect(hrefs).not.toContain('/savings/terminations');
    expect(hrefs).not.toContain('/settings/savings-products');
    expect(hrefs).not.toContain('/settings/loan-products');
  });

  it('never sees accounting, the website or admin', () => {
    expect(hrefs).not.toContain('/accounting');
    expect(hrefs).not.toContain('/cms/content');
    expect(hrefs).not.toContain('/settings/roles');
    expect(hrefs).not.toContain('/audit-logs');
  });
});

// ── Account officer ─────────────────────────────────────────────────────────

describe('account officer', () => {
  const hrefs = hrefsFor('ACCOUNT_OFFICER');

  it('never sees the operational modules, despite holding their READ permissions', () => {
    // An accountant reads loans, savings and deposits through the ledger and
    // reports — not through the departments' own operational screens.
    expect(hrefs).not.toContain('/loans');
    expect(hrefs).not.toContain('/savings');
    expect(hrefs).not.toContain('/fixed-deposits');
  });

  it('sees the full accounting section', () => {
    expect(hrefs).toContain('/accounting');
    expect(hrefs).toContain('/accounting/chart-of-accounts');
    expect(hrefs).toContain('/accounting/journal');
    expect(hrefs).toContain('/accounting/periods');
    expect(hrefs).toContain('/reports');
  });

  it('never sees HR or the website', () => {
    expect(hrefs).not.toContain('/hr');
    expect(hrefs).not.toContain('/hr/payroll');
    expect(hrefs).not.toContain('/cms/content');
    expect(visibleSections(viewer('ACCOUNT_OFFICER'))).not.toContain('Human Resources');
    expect(visibleSections(viewer('ACCOUNT_OFFICER'))).not.toContain('Website');
  });

  it('cannot reach role administration', () => {
    expect(hrefs).not.toContain('/settings/roles');
    expect(hrefs).not.toContain('/settings/sessions');
  });
});

// ── HR administrator ────────────────────────────────────────────────────────

describe('HR administrator', () => {
  const hrefs = hrefsFor('HR_ADMIN');

  it('sees the HR module', () => {
    expect(hrefs).toContain('/hr');
    expect(hrefs).toContain('/hr/staff');
    expect(hrefs).toContain('/hr/payroll');
    expect(hrefs).toContain('/hr/recruitment');
    expect(visibleSections(viewer('HR_ADMIN'))).toContain('Human Resources');
  });

  it('never sees customer money', () => {
    expect(hrefs).not.toContain('/loans');
    expect(hrefs).not.toContain('/savings');
    expect(hrefs).not.toContain('/fixed-deposits');
    expect(hrefs).not.toContain('/accounting');
    expect(hrefs).not.toContain('/customers');
  });

  it('never sees the website', () => {
    expect(hrefs).not.toContain('/cms/content');
    expect(hrefs).not.toContain('/cms/posts');
    expect(visibleSections(viewer('HR_ADMIN'))).not.toContain('Website');
  });
});

// ── IT administrator ────────────────────────────────────────────────────────

describe('IT administrator', () => {
  const hrefs = hrefsFor('IT_ADMIN');

  it('owns the website section', () => {
    expect(hrefs).toContain('/cms/content');
    expect(hrefs).toContain('/cms/posts');
    expect(visibleSections(viewer('IT_ADMIN'))).toContain('Website');
  });

  it('never sees customer, money or people data', () => {
    expect(hrefs).not.toContain('/customers');
    expect(hrefs).not.toContain('/loans');
    expect(hrefs).not.toContain('/savings');
    expect(hrefs).not.toContain('/fixed-deposits');
    expect(hrefs).not.toContain('/accounting');
    expect(hrefs).not.toContain('/reports');
    expect(hrefs).not.toContain('/hr');
    expect(hrefs).not.toContain('/hr/staff');
    expect(hrefs).not.toContain('/hr/payroll');
  });

  it('cannot administer roles, only system configuration', () => {
    // IT keeps the lights on; it does not grant itself or anyone else access.
    expect(hrefs).not.toContain('/settings/roles');
    expect(hrefs).not.toContain('/settings/sessions');
    expect(hrefs).toContain('/settings/configuration');
  });
});

// ── Super admin ─────────────────────────────────────────────────────────────

describe('super admin', () => {
  it('sees every section', () => {
    const sections = visibleSections(viewer('SUPER_ADMIN'));
    expect(sections).toEqual(
      expect.arrayContaining([
        'Customers',
        'Lending',
        'Savings',
        'Fixed Deposits',
        'Accounting',
        'Human Resources',
        'Website',
        'Security & Admin',
        'My Workspace',
      ])
    );
  });

  it('sees every entry in the nav', () => {
    expect(hrefsFor('SUPER_ADMIN')).toHaveLength(navItems.length);
  });
});

// ── canSee ──────────────────────────────────────────────────────────────────

describe('canSee', () => {
  const item = (perms: Partial<{ permission: string; permissions: string[] }>) => ({
    label: 'x',
    href: '/x',
    icon: (() => null) as never,
    color: 'blue',
    ...perms,
  });

  it('shows an entry with no permission requirement', () => {
    expect(canSee(item({}), { permissions: [] })).toBe(true);
  });

  it('requires the single permission when one is named', () => {
    expect(canSee(item({ permission: 'A:B' }), { permissions: [] })).toBe(false);
    expect(canSee(item({ permission: 'A:B' }), { permissions: ['A:B'] })).toBe(true);
  });

  it('treats a permission list as any-of', () => {
    const nav = item({ permissions: ['A:B', 'C:D'] });
    expect(canSee(nav, { permissions: ['C:D'] })).toBe(true);
    expect(canSee(nav, { permissions: ['E:F'] })).toBe(false);
  });
});

// ── Where each role lands on sign-in ────────────────────────────────────────

describe('landing page', () => {
  it('sends an HR-only user to the HR overview', () => {
    expect(resolveLandingPath(viewer('HR_ADMIN'))).toBe('/hr');
  });

  it('sends an IT-only user to the site content editor', () => {
    // The dashboard is permission-gated end to end, so IT would land on a page
    // rendering nothing but their own notification count.
    expect(resolveLandingPath(viewer('IT_ADMIN'))).toBe('/cms/content');
  });

  it('sends every operational role to the dashboard', () => {
    for (const role of ['SAVINGS_OFFICER', 'LOAN_OFFICER', 'VERIFICATION_OFFICER',
                        'ACCOUNT_OFFICER', 'SUPER_ADMIN'] as const) {
      expect(resolveLandingPath(viewer(role))).toBe('/dashboard');
    }
  });

  it('keeps customers out of the staff app entirely', () => {
    expect(resolveLandingPath({ permissions: [], userType: 'customer' })).toBe('/portal');
  });

  it('does not divert a super admin who also holds CMS permissions', () => {
    // isCmsFocused must mean "only CMS", never "has CMS".
    expect(isCmsFocused(viewer('SUPER_ADMIN'))).toBe(false);
  });
});
