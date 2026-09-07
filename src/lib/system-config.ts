/**
 * System Configuration Registry
 * Hylink Finance Limited EMS
 *
 * A typed registry of every runtime-configurable setting. The registry is the
 * source of truth: `SystemConfig` rows only ever *override* a default declared
 * here, so a fresh database and a seeded one behave identically.
 *
 * Reads are memoised per server instance for a short TTL so hot paths
 * (clock-in, payroll, report headers) don't hit the database on every call.
 */

import { prisma } from './prisma';

export type ConfigDataType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'TIME' | 'JSON';

export interface ConfigDefinition {
  key: string;
  category: string;
  label: string;
  description: string;
  dataType: ConfigDataType;
  defaultValue: string;
  /** Configuration that must never be exposed to non-admin clients. */
  isSecret?: boolean;
  /** Locked settings are shown read-only in the UI. */
  isEditable?: boolean;
}

// ============================================================================
// REGISTRY
// ============================================================================

export const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  // ── Organisation identity (used on reports, payslips, statements, emails) ──
  {
    key: 'company.name',
    category: 'ORGANISATION',
    label: 'Company Name',
    description: 'Legal name printed on reports, payslips and customer statements.',
    dataType: 'STRING',
    defaultValue: 'Hylink Finance Limited',
  },
  {
    key: 'company.shortName',
    category: 'ORGANISATION',
    label: 'Short Name',
    description: 'Abbreviated name used in headers and email subjects.',
    dataType: 'STRING',
    defaultValue: 'Hylink Finance',
  },
  {
    key: 'company.address',
    category: 'ORGANISATION',
    label: 'Registered Address',
    description: 'Head-office address shown on printed documents.',
    dataType: 'STRING',
    defaultValue: '',
  },
  {
    key: 'company.phone',
    category: 'ORGANISATION',
    label: 'Contact Phone',
    description: 'Phone number shown on customer-facing documents.',
    dataType: 'STRING',
    defaultValue: '',
  },
  {
    key: 'company.email',
    category: 'ORGANISATION',
    label: 'Contact Email',
    description: 'Support address shown on customer-facing documents.',
    dataType: 'STRING',
    defaultValue: 'info@hylinkfinance.com',
  },
  {
    key: 'company.rcNumber',
    category: 'ORGANISATION',
    label: 'RC Number',
    description: 'CAC registration number printed on official documents.',
    dataType: 'STRING',
    defaultValue: '',
  },
  {
    key: 'company.currency',
    category: 'ORGANISATION',
    label: 'Reporting Currency',
    description: 'ISO code of the currency all financial reports are presented in.',
    dataType: 'STRING',
    defaultValue: 'NGN',
  },

  // ── Attendance & working time ──
  {
    key: 'hr.workdayStart',
    category: 'ATTENDANCE',
    label: 'Standard Work Day Start',
    description: 'Default clock-in time. Staff clocking in after this (plus grace) are marked LATE.',
    dataType: 'TIME',
    defaultValue: '09:00',
  },
  {
    key: 'hr.workdayEnd',
    category: 'ATTENDANCE',
    label: 'Standard Work Day End',
    description: 'Default clock-out time, used to compute overtime.',
    dataType: 'TIME',
    defaultValue: '17:00',
  },
  {
    key: 'hr.lateGraceMinutes',
    category: 'ATTENDANCE',
    label: 'Lateness Grace Period (minutes)',
    description: 'Minutes after the work-day start before an arrival counts as late.',
    dataType: 'NUMBER',
    defaultValue: '15',
  },
  {
    key: 'hr.workDays',
    category: 'ATTENDANCE',
    label: 'Working Days',
    description: 'Days of the week that count as working days (0 = Sunday … 6 = Saturday).',
    dataType: 'JSON',
    defaultValue: '[1,2,3,4,5]',
  },
  {
    key: 'hr.overtimeThresholdMinutes',
    category: 'ATTENDANCE',
    label: 'Overtime Threshold (minutes)',
    description: 'Minutes worked past the work-day end before overtime starts accruing.',
    dataType: 'NUMBER',
    defaultValue: '30',
  },
  {
    key: 'hr.allowRemoteClockIn',
    category: 'ATTENDANCE',
    label: 'Allow Remote Clock-In',
    description: 'When off, staff may only clock in by scanning the office QR code.',
    dataType: 'BOOLEAN',
    defaultValue: 'true',
  },

  // ── Leave ──
  {
    key: 'hr.leaveYearStartMonth',
    category: 'LEAVE',
    label: 'Leave Year Start Month',
    description: 'Month (1-12) the annual leave entitlement year begins.',
    dataType: 'NUMBER',
    defaultValue: '1',
  },
  {
    key: 'hr.leaveMinNoticeDays',
    category: 'LEAVE',
    label: 'Minimum Leave Notice (days)',
    description: 'How far ahead of the start date a leave request must be submitted.',
    dataType: 'NUMBER',
    defaultValue: '3',
  },
  {
    key: 'hr.allowNegativeLeaveBalance',
    category: 'LEAVE',
    label: 'Allow Negative Leave Balance',
    description: 'Permit approving leave that exceeds the remaining entitlement.',
    dataType: 'BOOLEAN',
    defaultValue: 'false',
  },

  // ── Payroll ──
  {
    key: 'payroll.payDayOfMonth',
    category: 'PAYROLL',
    label: 'Pay Day',
    description: 'Day of the month salaries are paid.',
    dataType: 'NUMBER',
    defaultValue: '25',
  },
  {
    key: 'payroll.pensionEmployeeRate',
    category: 'PAYROLL',
    label: 'Employee Pension Rate (%)',
    description: 'Statutory employee pension contribution as a percentage of pensionable pay.',
    dataType: 'NUMBER',
    defaultValue: '8',
  },
  {
    key: 'payroll.pensionEmployerRate',
    category: 'PAYROLL',
    label: 'Employer Pension Rate (%)',
    description: 'Statutory employer pension contribution as a percentage of pensionable pay.',
    dataType: 'NUMBER',
    defaultValue: '10',
  },
  {
    key: 'payroll.nhfRate',
    category: 'PAYROLL',
    label: 'NHF Rate (%)',
    description: 'National Housing Fund contribution as a percentage of basic salary.',
    dataType: 'NUMBER',
    defaultValue: '2.5',
  },
  {
    key: 'payroll.consolidatedReliefFixed',
    category: 'PAYROLL',
    label: 'Consolidated Relief — Fixed (annual)',
    description: 'Fixed component of the annual consolidated relief allowance for PAYE.',
    dataType: 'NUMBER',
    defaultValue: '200000',
  },
  {
    key: 'payroll.consolidatedReliefPercent',
    category: 'PAYROLL',
    label: 'Consolidated Relief — Percent of Gross',
    description: 'Percentage of gross income added to the fixed relief when computing PAYE.',
    dataType: 'NUMBER',
    defaultValue: '20',
  },
  {
    key: 'payroll.lopEnabled',
    category: 'PAYROLL',
    label: 'Deduct Loss of Pay',
    description: 'Prorate salary down for unpaid absence days recorded in attendance.',
    dataType: 'BOOLEAN',
    defaultValue: 'true',
  },

  // ── Security ──
  {
    key: 'security.passwordMinLength',
    category: 'SECURITY',
    label: 'Minimum Password Length',
    description: 'Shortest password a staff member may set.',
    dataType: 'NUMBER',
    defaultValue: '8',
  },
  {
    key: 'security.passwordExpiryDays',
    category: 'SECURITY',
    label: 'Password Expiry (days)',
    description: 'Days before a password must be changed. 0 disables expiry.',
    dataType: 'NUMBER',
    defaultValue: '0',
  },
  {
    key: 'security.maxFailedLogins',
    category: 'SECURITY',
    label: 'Max Failed Logins',
    description: 'Failed attempts before an account is locked.',
    dataType: 'NUMBER',
    defaultValue: '5',
  },
  {
    key: 'security.lockoutMinutes',
    category: 'SECURITY',
    label: 'Lockout Duration (minutes)',
    description: 'How long an account stays locked after too many failed attempts.',
    dataType: 'NUMBER',
    defaultValue: '30',
  },
  {
    key: 'security.sessionIdleMinutes',
    category: 'SECURITY',
    label: 'Session Idle Timeout (minutes)',
    description: 'Idle time before a session is treated as stale and revoked.',
    dataType: 'NUMBER',
    defaultValue: '480',
  },

  // ── Operations ──
  {
    key: 'ops.loanApprovalL1Limit',
    category: 'OPERATIONS',
    label: 'Level-1 Approval Ceiling',
    description: 'Loans above this principal require a second (Level-2) approval.',
    dataType: 'NUMBER',
    defaultValue: '1000000',
  },
  {
    key: 'ops.withdrawalApprovalThreshold',
    category: 'OPERATIONS',
    label: 'Withdrawal Approval Threshold',
    description: 'Savings withdrawals at or above this amount require manager approval.',
    dataType: 'NUMBER',
    defaultValue: '100000',
  },
  {
    key: 'ops.emailAlertsEnabled',
    category: 'OPERATIONS',
    label: 'Email Alerts Enabled',
    description: 'Master switch for outbound notification emails.',
    dataType: 'BOOLEAN',
    defaultValue: 'true',
  },
];

const DEFINITION_BY_KEY = new Map(CONFIG_DEFINITIONS.map((d) => [d.key, d]));

export type ConfigKey = string;

// ============================================================================
// CACHE
// ============================================================================

const CACHE_TTL_MS = 30_000;

let cache: Map<string, string> | null = null;
let cacheExpiresAt = 0;

/** Drop the memoised config so the next read reloads from the database. */
export function invalidateConfigCache(): void {
  cache = null;
  cacheExpiresAt = 0;
}

async function loadConfig(): Promise<Map<string, string>> {
  if (cache && Date.now() < cacheExpiresAt) return cache;

  const map = new Map<string, string>();
  for (const def of CONFIG_DEFINITIONS) map.set(def.key, def.defaultValue);

  try {
    const rows = await prisma.systemConfig.findMany();
    for (const row of rows) map.set(row.key, row.value);
  } catch (error) {
    // A config read must never take down a request — fall back to defaults.
    console.error('Failed to load system config, using defaults:', error);
  }

  cache = map;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return map;
}

// ============================================================================
// TYPED ACCESSORS
// ============================================================================

export async function getConfig(key: ConfigKey): Promise<string> {
  const map = await loadConfig();
  return map.get(key) ?? DEFINITION_BY_KEY.get(key)?.defaultValue ?? '';
}

export async function getConfigNumber(key: ConfigKey): Promise<number> {
  const raw = await getConfig(key);
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return parsed;
  return Number(DEFINITION_BY_KEY.get(key)?.defaultValue ?? 0) || 0;
}

export async function getConfigBoolean(key: ConfigKey): Promise<boolean> {
  const raw = (await getConfig(key)).trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/** Parse a TIME value ("HH:mm") into hours and minutes. */
export async function getConfigTime(key: ConfigKey): Promise<{ hours: number; minutes: number }> {
  const raw = await getConfig(key);
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return { hours: 9, minutes: 0 };
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export async function getConfigJson<T>(key: ConfigKey, fallback: T): Promise<T> {
  const raw = await getConfig(key);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Read several keys at once — one cache hit rather than N. */
export async function getConfigMany(keys: ConfigKey[]): Promise<Record<string, string>> {
  const map = await loadConfig();
  const out: Record<string, string> = {};
  for (const key of keys) {
    out[key] = map.get(key) ?? DEFINITION_BY_KEY.get(key)?.defaultValue ?? '';
  }
  return out;
}

// ============================================================================
// VALIDATION & WRITES
// ============================================================================

export function getDefinition(key: ConfigKey): ConfigDefinition | undefined {
  return DEFINITION_BY_KEY.get(key);
}

/**
 * Validate a raw string against its declared data type.
 * Returns the normalised value, or an error message.
 */
export function validateConfigValue(
  key: ConfigKey,
  value: string
): { ok: true; value: string } | { ok: false; error: string } {
  const def = DEFINITION_BY_KEY.get(key);
  if (!def) return { ok: false, error: `Unknown configuration key: ${key}` };
  if (def.isEditable === false) return { ok: false, error: `${def.label} is not editable` };

  const trimmed = value.trim();

  switch (def.dataType) {
    case 'NUMBER': {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return { ok: false, error: `${def.label} must be a number` };
      if (n < 0) return { ok: false, error: `${def.label} cannot be negative` };
      return { ok: true, value: String(n) };
    }
    case 'BOOLEAN': {
      const lowered = trimmed.toLowerCase();
      if (!['true', 'false'].includes(lowered)) {
        return { ok: false, error: `${def.label} must be true or false` };
      }
      return { ok: true, value: lowered };
    }
    case 'TIME': {
      if (!/^\d{1,2}:\d{2}$/.test(trimmed)) {
        return { ok: false, error: `${def.label} must be in HH:mm format` };
      }
      const [h, m] = trimmed.split(':').map(Number);
      if (h > 23 || m > 59) return { ok: false, error: `${def.label} is not a valid time` };
      return { ok: true, value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
    }
    case 'JSON': {
      try {
        JSON.parse(trimmed);
      } catch {
        return { ok: false, error: `${def.label} must be valid JSON` };
      }
      return { ok: true, value: trimmed };
    }
    default:
      return { ok: true, value: trimmed };
  }
}

/**
 * Resolve the effective settings list: every registry entry, with its stored
 * override applied when one exists. Used by the settings UI.
 */
export async function listEffectiveConfig(): Promise<
  Array<ConfigDefinition & { value: string; isOverridden: boolean; updatedAt: Date | null }>
> {
  const rows = await prisma.systemConfig.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return CONFIG_DEFINITIONS.map((def) => {
    const row = byKey.get(def.key);
    return {
      ...def,
      value: row?.value ?? def.defaultValue,
      isOverridden: Boolean(row) && row!.value !== def.defaultValue,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

/**
 * Persist an override. Writing a value equal to the registry default still
 * stores a row so the audit trail records who set it.
 */
export async function setConfigValue(
  key: ConfigKey,
  value: string,
  updatedById: string
): Promise<void> {
  const def = DEFINITION_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown configuration key: ${key}`);

  await prisma.systemConfig.upsert({
    where: { key },
    update: { value, updatedById },
    create: {
      key,
      value,
      category: def.category,
      label: def.label,
      description: def.description,
      dataType: def.dataType,
      isSecret: def.isSecret ?? false,
      isEditable: def.isEditable ?? true,
      updatedById,
    },
  });

  invalidateConfigCache();
}

/** Remove an override so the registry default applies again. */
export async function resetConfigValue(key: ConfigKey): Promise<void> {
  await prisma.systemConfig.deleteMany({ where: { key } });
  invalidateConfigCache();
}
