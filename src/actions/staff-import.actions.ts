'use server';

/**
 * Bulk staff upload — Server Actions
 * Hylink Finance Limited EMS
 *
 * HR fills the template (one row per person, department/role/branch by name),
 * uploads it, sees every row checked, then creates all the ready rows at once.
 * The commit re-checks everything on the server, so the preview is advice and
 * never trusted. Each new staff member is emailed their sign-in details, and
 * HR gets the same list on screen (lib/staff-create).
 */

import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createStaffRecord, emailStaffLogin } from '@/lib/staff-create';
import { resolveImportRows, MAX_IMPORT_ROWS, type ImportRow, type ResolvedRow } from '@/lib/staff-input';
import type { ActionResult } from '@/types';
import type { IssuedLogin } from '@/actions/auth.actions';

async function lists() {
  const [departments, roles, branches] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
    prisma.role.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { level: 'asc' } }),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
  ]);
  return { departments, roles, branches };
}

/** Departments, roles and branches by name: the template's dropdowns. */
export async function getImportLists() {
  await requirePermission('HR:STAFF_CREATE');
  const l = await lists();
  return {
    departments: l.departments.map((d) => d.name),
    roles: l.roles.map((r) => r.name),
    branches: l.branches.map((b) => b.name),
  };
}

async function resolve(rows: ImportRow[]): Promise<{ resolved: ResolvedRow[]; l: Awaited<ReturnType<typeof lists>> }> {
  if (!Array.isArray(rows)) throw new Error('No rows to read');
  if (rows.length === 0) throw new Error('The file has no staff rows');
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Upload at most ${MAX_IMPORT_ROWS} staff at a time. Split the file and upload the rest after.`);

  const l = await lists();
  const emails = rows.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean);
  const taken = await prisma.staff.findMany({ where: { email: { in: emails } }, select: { email: true } });
  return { resolved: resolveImportRows(rows, l, new Set(taken.map((t) => t.email.toLowerCase()))), l };
}

export type PreviewRow = Omit<ResolvedRow, 'input'> & { ready: boolean };

/** Checks every row without creating anything. */
export async function previewStaffImport(rows: ImportRow[]): Promise<ActionResult<PreviewRow[]>> {
  try {
    await requirePermission('HR:STAFF_CREATE');
    const { resolved } = await resolve(rows);
    return { success: true, data: resolved.map(({ input, ...r }) => ({ ...r, ready: !!input })) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not read the file' };
  }
}

export interface ImportResult {
  created: (IssuedLogin & { emailed: boolean })[];
  skipped: { line: number; name: string; problems: string[] }[];
}

/** Creates every ready row; rows with problems are reported, not created. */
export async function commitStaffImport(rows: ImportRow[], options: { sendEmails: boolean }): Promise<ActionResult<ImportResult>> {
  try {
    const user = await requirePermission('HR:STAFF_CREATE');
    const { resolved, l } = await resolve(rows);

    const created: ImportResult['created'] = [];
    const skipped: ImportResult['skipped'] = resolved
      .filter((r) => !r.input)
      .map((r) => ({ line: r.line, name: r.name, problems: r.problems }));

    // One at a time: employee IDs come from a sequence, and a failure on one
    // row (say, an email taken a moment ago) must not stop the rest.
    for (const row of resolved) {
      if (!row.input) continue;
      try {
        const made = await createStaffRecord(row.input, user, 'bulk upload');
        const emailed = options.sendEmails
          ? await emailStaffLogin({ email: row.input.email, firstName: row.input.firstName, ...made })
          : false;
        created.push({
          staffId: made.staffId,
          name: row.name,
          employeeId: made.employeeId,
          email: row.input.email,
          role: l.roles.find((r) => r.id === row.input!.roleId)?.name ?? null,
          branch: l.branches.find((b) => b.id === row.input!.branchId)?.name ?? null,
          tempPassword: made.tempPassword,
          emailed,
        });
      } catch (error) {
        skipped.push({ line: row.line, name: row.name, problems: [error instanceof Error ? error.message : 'Could not be created'] });
      }
    }

    await auditLog({
      userId: user.id, action: 'CREATE', module: 'HR', entityType: 'STAFF_IMPORT',
      description: `Bulk upload: created ${created.length} staff, skipped ${skipped.length}`,
    });

    skipped.sort((a, b) => a.line - b.line);
    const message = `Created ${created.length} staff${skipped.length ? `, ${skipped.length} row(s) skipped` : ''}`;
    return { success: true, message, data: { created, skipped } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'The upload failed' };
  }
}
