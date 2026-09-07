/**
 * Application navigation.
 *
 * Lives outside the sidebar component so departmental access control can be
 * tested directly: given a role's permissions, exactly which entries appear.
 *
 * Two rules hold the structure together:
 *  - Every entry that exposes a department's data carries a permission. An
 *    entry with no permission is visible to everyone, so it must be the staff
 *    member's own record (their payslip, their leave) and never a module.
 *  - A section heading belongs to the first entry beneath it that survives
 *    filtering, so a heading never renders above an empty run.
 *  - Sections are gated on the permissions that mean you *operate* that
 *    department, never on its READ permission. A loan officer holds
 *    SAVINGS:READ so they can see a customer's savings while assessing a
 *    loan; that must not hand them the savings module in the sidebar.
 */
import {
  LayoutDashboard, Users, Landmark, PiggyBank, Wallet, BookOpen,
  BarChart3, UserCog, Clock, CalendarOff, Star, ClipboardCheck,
  FileText, Shield, Settings, Bell, ChevronLeft, ChevronRight, X, UserCircle,
  Briefcase, GraduationCap, Laptop, Megaphone, Network, ArrowRightLeft,
  ClipboardList, Receipt, HeartHandshake, Package, Percent, Layers,
  CalendarDays, XCircle, LayoutTemplate, Newspaper, ShieldCheck,
  MonitorSmartphone, Building2, SlidersHorizontal,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  permissions?: string[];
  color: string;
  /** Heading rendered above this item, opening a new section of the nav. */
  section?: string;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'blue' },

  // ── Customers ────────────────────────────────────────────────────────────
  { label: 'Customers',      href: '/customers',      icon: Users,          color: 'cyan',    permission: 'CUSTOMERS:READ', section: 'Customers' },

  // ── Lending ──────────────────────────────────────────────────────────────
  { label: 'Loans',          href: '/loans',          icon: Landmark,       color: 'orange',  permissions: ['LOANS:CREATE', 'LOANS:APPROVE', 'LOANS:APPROVE_L1', 'LOANS:APPROVE_L2', 'LOANS:DISBURSE', 'LOANS:REPAYMENT', 'LOANS:COLLECT', 'LOANS:MANAGE_ALL', 'LOANS:RESTRUCTURE'], section: 'Lending' },
  { label: 'Verification',   href: '/verification',   icon: ClipboardCheck, color: 'yellow',  permissions: ['LOANS:VERIFY', 'VERIFICATION:READ', 'VERIFICATION:PROCESS'] },
  { label: 'Loan Products',  href: '/settings/loan-products', icon: Package, color: 'orange', permission: 'SYSTEM:CONFIG_MANAGE' },

  // ── Savings ──────────────────────────────────────────────────────────────
  { label: 'Savings',        href: '/savings',            icon: PiggyBank,   color: 'emerald', permissions: ['SAVINGS:CREATE', 'SAVINGS:TRANSACT', 'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW', 'SAVINGS:APPROVE'], section: 'Savings' },
  { label: 'Accounts',       href: '/savings/accounts',   icon: BookOpen,    color: 'emerald', permissions: ['SAVINGS:CREATE', 'SAVINGS:TRANSACT', 'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW', 'SAVINGS:APPROVE'] },
  { label: 'Withdrawals',    href: '/savings/withdrawals',icon: ArrowRightLeft, color: 'teal', permissions: ['SAVINGS:WITHDRAW', 'SAVINGS:APPROVE'] },
  { label: 'Terminations',   href: '/savings/terminations', icon: XCircle,   color: 'rose',    permissions: ['SAVINGS:APPROVE', 'SAVINGS:TRANSACT'] },
  { label: 'Savings Reports',href: '/savings/reports',    icon: BarChart3,   color: 'teal',    permissions: ['SAVINGS:CREATE', 'SAVINGS:TRANSACT', 'SAVINGS:DEPOSIT', 'SAVINGS:WITHDRAW', 'SAVINGS:APPROVE'] },
  { label: 'Savings Products', href: '/settings/savings-products', icon: Package, color: 'emerald', permissions: ['SETTINGS:MANAGE', 'SYSTEM:CONFIG_MANAGE'] },

  // ── Fixed deposits ───────────────────────────────────────────────────────
  { label: 'Fixed Deposits', href: '/fixed-deposits',  icon: Wallet,  color: 'purple', permissions: ['FIXED_DEPOSITS:CREATE', 'FIXED_DEPOSITS:MANAGE', 'FIXED_DEPOSITS:LIQUIDATE'], section: 'Fixed Deposits' },
  { label: 'Deposit Rates',  href: '/settings/deposit-rates', icon: Percent, color: 'purple', permission: 'SYSTEM:CONFIG_MANAGE' },

  // ── Accounting ───────────────────────────────────────────────────────────
  { label: 'Accounting',       href: '/accounting',                     icon: BookOpen,  color: 'sky', permissions: ['ACCOUNTS:COA_MANAGE', 'ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:REPORTS_VIEW'], section: 'Accounting' },
  { label: 'Chart of Accounts',href: '/accounting/chart-of-accounts',   icon: Layers,    color: 'sky', permission: 'ACCOUNTS:COA_MANAGE' },
  { label: 'Journal Entries',  href: '/accounting/journal',             icon: FileText,  color: 'sky', permissions: ['ACCOUNTS:JOURNAL_CREATE', 'ACCOUNTS:JOURNAL_POST'] },
  { label: 'Periods',          href: '/accounting/periods',             icon: CalendarDays, color: 'sky', permission: 'ACCOUNTS:PERIOD_CLOSE' },
  { label: 'Reports',          href: '/reports',                        icon: BarChart3, color: 'pink', permission: 'ACCOUNTS:REPORTS_VIEW' },

  // ── Human resources ──────────────────────────────────────────────────────
  // Gated on HR permissions throughout. Personal self-service (own profile,
  // payslip, leave, clock-in) lives under My Workspace instead, so a savings
  // or loan officer never sees the HR module at all.
  { label: 'HR Overview',   href: '/hr',               icon: HeartHandshake, color: 'violet',  permissions: ['HR:STAFF_READ', 'HR:ANALYTICS_VIEW', 'HR:PAYROLL_MANAGE', 'HR:RECRUITMENT_MANAGE'], section: 'Human Resources' },
  { label: 'People',        href: '/hr/staff',         icon: UserCog,        color: 'indigo',  permission: 'HR:STAFF_READ' },
  { label: 'Payroll',       href: '/hr/payroll',       icon: Wallet,         color: 'emerald', permissions: ['HR:PAYROLL_READ', 'HR:PAYROLL_MANAGE', 'HR:PAYROLL_APPROVE'] },
  { label: 'Recruitment',   href: '/hr/recruitment',   icon: Briefcase,      color: 'cyan',    permission: 'HR:RECRUITMENT_MANAGE' },
  { label: 'Onboarding',    href: '/hr/onboarding',    icon: ClipboardList,  color: 'sky',     permissions: ['HR:STAFF_READ', 'HR:STAFF_UPDATE'] },
  { label: 'Movements',     href: '/hr/lifecycle',     icon: ArrowRightLeft, color: 'orange',  permissions: ['HR:STAFF_READ', 'HR:STAFF_UPDATE'] },
  { label: 'Performance',   href: '/hr/performance',   icon: Star,           color: 'gold',    permission: 'HR:PERFORMANCE_MANAGE' },
  { label: 'Learning',      href: '/hr/training',      icon: GraduationCap,  color: 'purple',  permission: 'HR:TRAINING_MANAGE' },
  { label: 'Assets',        href: '/hr/assets',        icon: Laptop,         color: 'slate',   permission: 'HR:ASSET_MANAGE' },
  { label: 'Org Chart',     href: '/hr/org-chart',     icon: Network,        color: 'blue',    permission: 'HR:STAFF_READ' },
  { label: 'HR Settings',   href: '/hr/settings',      icon: Settings,       color: 'gray',    permissions: ['HR:CONFIG_MANAGE', 'SYSTEM:CONFIG_MANAGE'] },

  // ── Website / CMS ────────────────────────────────────────────────────────
  { label: 'Site Content',  href: '/cms/content', icon: LayoutTemplate, color: 'fuchsia', permission: 'CMS:READ', section: 'Website' },
  { label: 'Blog Posts',    href: '/cms/posts',   icon: Newspaper,      color: 'fuchsia', permission: 'CMS:READ' },

  // ── Security & administration ────────────────────────────────────────────
  { label: 'Roles & Permissions', href: '/settings/roles',         icon: ShieldCheck,        color: 'rose',  permissions: ['SYSTEM:USER_MANAGE', 'ADMIN:SYSTEM'], section: 'Security & Admin' },
  { label: 'Active Sessions',     href: '/settings/sessions',      icon: MonitorSmartphone,  color: 'rose',  permission: 'SYSTEM:USER_MANAGE' },
  { label: 'Audit Logs',          href: '/audit-logs',             icon: Shield,             color: 'slate', permission: 'AUDIT:READ' },
  { label: 'Organisation',        href: '/settings/organisation',  icon: Building2,          color: 'gray',  permission: 'SYSTEM:CONFIG_MANAGE' },
  { label: 'Configuration',       href: '/settings/configuration', icon: SlidersHorizontal,  color: 'gray',  permission: 'SYSTEM:CONFIG_MANAGE' },
  { label: 'Settings',            href: '/settings',               icon: Settings,           color: 'gray',  permission: 'SYSTEM:CONFIG_MANAGE' },

  // ── My workspace ─────────────────────────────────────────────────────────
  // Everyone gets these: they are the staff member's own records, not the HR
  // module. Keeping them in their own section is what lets HR be locked down
  // without taking clock-in, leave or payslips away from the whole company.
  { label: 'My Profile',     href: '/hr/my-profile',    icon: UserCircle, color: 'violet',  section: 'My Workspace' },
  { label: 'My Payslips',    href: '/hr/my-payslips',   icon: Receipt,    color: 'emerald' },
  { label: 'Attendance',     href: '/hr/attendance',    icon: Clock,      color: 'teal' },
  { label: 'Leave',          href: '/hr/leave',         icon: CalendarOff,color: 'amber' },
  { label: 'Announcements',  href: '/hr/announcements', icon: Megaphone,  color: 'fuchsia' },
  { label: 'Documents',      href: '/documents',        icon: FileText,   color: 'rose',    permission: 'DOCUMENTS:READ' },
  { label: 'Notifications',  href: '/notifications',    icon: Bell,       color: 'fuchsia' },
];

export interface NavViewer {
  permissions: string[];
}

/** Whether a viewer may see one entry. */
export function canSee(item: NavItem, viewer: NavViewer): boolean {
  if (!item.permission && !item.permissions) return true;
  if (item.permission) return viewer.permissions.includes(item.permission);
  if (item.permissions) return item.permissions.some((p) => viewer.permissions.includes(p));
  return false;
}

export interface ResolvedNav {
  items: NavItem[];
  /** href -> the section heading that should render above it. */
  headings: Map<string, string>;
}

/**
 * The nav a viewer actually gets, with headings reattached to the first
 * surviving entry in each section.
 */
export function resolveNav(
  viewer: NavViewer,
  options: { hideDashboard?: boolean } = {}
): ResolvedNav {
  const visible = (item: NavItem) => {
    if (options.hideDashboard && item.href === '/dashboard') return false;
    return canSee(item, viewer);
  };

  const items = navItems.filter(visible);

  const headings = new Map<string, string>();
  let pending: string | undefined;
  for (const item of navItems) {
    if (item.section) pending = item.section;
    if (!visible(item)) continue;
    if (pending) {
      headings.set(item.href, pending);
      pending = undefined;
    }
  }

  return { items, headings };
}

/** The section headings a viewer will actually see. Useful for assertions. */
export function visibleSections(viewer: NavViewer): string[] {
  const { headings } = resolveNav(viewer);
  return Array.from(new Set(headings.values()));
}
