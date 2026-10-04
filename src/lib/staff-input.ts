/**
 * Staff details — cleaning, bulk-upload rows, and matching names to records.
 *
 * Pure: shared by the New Staff dialog, the bulk upload (its preview runs the
 * same checks as its commit) and onboarding approval, and testable without a
 * database.
 */

export interface StaffInput {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phone?: string;
  departmentId: string;
  roleId: string;
  branchId?: string;
  supervisorId?: string;
  /** YYYY-MM-DD. */
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  nationalId?: string;
}

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const optional = (v: unknown, max: number) => clean(v, max) || undefined;

/** "male", "M", "Female" ... to the stored value, or undefined. */
export function toGender(value: unknown): string | undefined {
  const v = clean(value, 20).toUpperCase();
  if (!v) return undefined;
  if (v === 'M' || v === 'MALE') return 'MALE';
  if (v === 'F' || v === 'FEMALE') return 'FEMALE';
  if (v === 'OTHER' || v === 'O') return 'OTHER';
  return undefined;
}

/** Problems with a set of staff details, in words for the person fixing them. Empty when fine. */
export function staffInputProblems(data: Partial<StaffInput>): string[] {
  const problems: string[] = [];
  if (!clean(data.firstName, 60)) problems.push('First name is missing');
  if (!clean(data.lastName, 60)) problems.push('Last name is missing');
  const email = clean(data.email, 160).toLowerCase();
  if (!email) problems.push('Email is missing');
  else if (!EMAIL.test(email)) problems.push(`"${email}" is not a valid email`);
  if (!data.departmentId) problems.push('Department is missing');
  if (!data.roleId) problems.push('Role is missing');
  if (data.dateOfBirth) {
    const d = new Date(`${data.dateOfBirth}T00:00:00Z`);
    if (!DATE.test(data.dateOfBirth) || Number.isNaN(d.getTime())) problems.push('Date of birth must be a date (YYYY-MM-DD)');
    else if (d > new Date()) problems.push('Date of birth is in the future');
  }
  if (data.gender && !GENDERS.includes(data.gender as (typeof GENDERS)[number])) problems.push('Gender must be Male, Female or Other');
  if (data.phone && clean(data.phone, 30).replace(/\D/g, '').length < 7) problems.push('Phone number looks too short');
  return problems;
}

/** Trimmed, lower-cased email, capped lengths. Throws the first problem. */
export function normalizeStaffInput(data: StaffInput): StaffInput {
  const problems = staffInputProblems(data);
  if (problems.length) throw new Error(problems[0]);
  return {
    firstName: clean(data.firstName, 60),
    lastName: clean(data.lastName, 60),
    middleName: optional(data.middleName, 60),
    email: clean(data.email, 160).toLowerCase(),
    phone: optional(data.phone, 30),
    departmentId: data.departmentId,
    roleId: data.roleId,
    branchId: data.branchId || undefined,
    supervisorId: data.supervisorId || undefined,
    dateOfBirth: optional(data.dateOfBirth, 10),
    gender: data.gender || undefined,
    address: optional(data.address, 300),
    nationalId: optional(data.nationalId, 40),
  };
}

// ─── Bulk upload ────────────────────────────────────────────────────────────

/** The template's columns, in order. Starred columns are required. */
export const IMPORT_COLUMNS = [
  { key: 'firstName', header: 'First Name*' },
  { key: 'lastName', header: 'Last Name*' },
  { key: 'middleName', header: 'Middle Name' },
  { key: 'email', header: 'Email*' },
  { key: 'phone', header: 'Phone' },
  { key: 'department', header: 'Department*' },
  { key: 'role', header: 'Role*' },
  { key: 'branch', header: 'Branch' },
  { key: 'dateOfBirth', header: 'Date of Birth (YYYY-MM-DD)' },
  { key: 'gender', header: 'Gender (Male/Female/Other)' },
  { key: 'address', header: 'Address' },
  { key: 'nationalId', header: 'National ID' },
] as const;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]['key'];
export type ImportRow = Partial<Record<ImportKey, string>>;

export const MAX_IMPORT_ROWS = 100;

/** Parses CSV text: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Turns a sheet (header row first) into rows keyed by column. Headers are
 * matched loosely ("first name", "First Name*", "FIRSTNAME" all work), so a
 * reordered or retyped header still lines up.
 */
export function sheetToRows(sheet: string[][]): { rows: ImportRow[]; missing: string[] } {
  if (sheet.length === 0) return { rows: [], missing: IMPORT_COLUMNS.filter((c) => c.header.includes('*')).map((c) => c.header) };
  const header = sheet[0].map((h) => squash(h.replace(/\(.*\)/, '')));
  const index = new Map<ImportKey, number>();
  for (const col of IMPORT_COLUMNS) {
    const i = header.indexOf(squash(col.header.replace(/\(.*\)/, '')));
    if (i >= 0) index.set(col.key, i);
  }
  const missing = IMPORT_COLUMNS.filter((c) => c.header.includes('*') && !index.has(c.key)).map((c) => c.header.replace('*', ''));
  const rows = sheet.slice(1).map((cells) => {
    const row: ImportRow = {};
    for (const [key, i] of index) {
      const v = (cells[i] ?? '').trim();
      if (v) row[key] = v;
    }
    return row;
  });
  return { rows, missing };
}

export interface Named { id: string; name: string; code?: string | null }

/** Finds a department, role or branch by its name or code, ignoring case and punctuation. */
export function matchByName<T extends Named>(value: string | undefined, list: T[]): T | undefined {
  if (!value) return undefined;
  const v = squash(value);
  return list.find((x) => squash(x.name) === v) ?? list.find((x) => x.code && squash(x.code) === v);
}

/** A date from a sheet: YYYY-MM-DD, DD/MM/YYYY (the Nigerian way round) or an ISO timestamp. */
export function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return v; // left as typed, so the check names it
}

export interface ResolvedRow {
  /** 1-based, counting the header as row 1, as a spreadsheet shows it. */
  line: number;
  name: string;
  email: string;
  input: StaffInput | null;
  problems: string[];
}

/**
 * Checks every row and resolves names to records. A row is ready when it has
 * no problems; the email must be new to the system and appear once in the file.
 */
export function resolveImportRows(
  rows: ImportRow[],
  lists: { departments: Named[]; roles: Named[]; branches: Named[] },
  takenEmails: Set<string>
): ResolvedRow[] {
  const seen = new Map<string, number>();
  return rows.map((row, i) => {
    const line = i + 2;
    const problems: string[] = [];
    const department = matchByName(row.department, lists.departments);
    const role = matchByName(row.role, lists.roles);
    const branch = matchByName(row.branch, lists.branches);
    if (row.department && !department) problems.push(`No department called "${row.department}"`);
    if (row.role && !role) problems.push(`No role called "${row.role}"`);
    if (row.branch && !branch) problems.push(`No branch called "${row.branch}"`);
    const gender = toGender(row.gender);
    if (row.gender && !gender) problems.push('Gender must be Male, Female or Other');

    const input: StaffInput = {
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      middleName: row.middleName,
      email: (row.email ?? '').trim().toLowerCase(),
      phone: row.phone,
      departmentId: department?.id ?? '',
      roleId: role?.id ?? '',
      branchId: branch?.id,
      dateOfBirth: toIsoDate(row.dateOfBirth),
      gender,
      address: row.address,
      nationalId: row.nationalId,
    };
    for (const p of staffInputProblems(input)) {
      // A named-but-unknown department already says why; skip the bare "missing".
      if (p === 'Department is missing' && row.department) continue;
      if (p === 'Role is missing' && row.role) continue;
      if (p.startsWith('Gender') && row.gender) continue;
      problems.push(p);
    }

    if (input.email) {
      if (takenEmails.has(input.email)) problems.push(`${input.email} already belongs to a staff member`);
      const first = seen.get(input.email);
      if (first) problems.push(`Same email as row ${first}`);
      else seen.set(input.email, line);
    }

    return {
      line,
      name: [input.firstName, input.lastName].filter(Boolean).join(' ') || '(no name)',
      email: input.email,
      input: problems.length ? null : input,
      problems,
    };
  });
}
