/**
 * Creating a staff member — the one path every route uses.
 *
 * The New Staff dialog, the bulk upload and onboarding approval all create
 * staff the same way: a new employee ID, a temporary password the staff
 * member must change at first sign-in (lib/temp-password, so it shows in the
 * login-details directory until they do), and an audit entry.
 *
 * No authorisation here: callers check HR:STAFF_CREATE first.
 */
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { generateReference } from '@/lib/utils';
import { issueTempPassword } from '@/lib/temp-password';
import { sendEmail, renderAlertEmail } from '@/lib/email';
import { normalizeStaffInput, type StaffInput } from '@/lib/staff-input';

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface CreatedStaff {
  staffId: string;
  employeeId: string;
  tempPassword: string;
}

export async function createStaffRecord(
  input: StaffInput,
  actor: { id: string },
  /** Words for the audit trail: how the record came to be. */
  via = 'New Staff'
): Promise<CreatedStaff> {
  const data = normalizeStaffInput(input);

  const existing = await prisma.staff.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) throw new Error(`${data.email} is already in use by another staff member`);

  const employeeId = await generateReference('EMPLOYEE');
  const staffId = randomUUID();
  const { password: tempPassword, issuedAt } = issueTempPassword(staffId);
  const passwordHash = await hash(tempPassword, 12);

  await prisma.staff.create({
    data: {
      id: staffId,
      employeeId,
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      middleName: data.middleName,
      phone: data.phone,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      gender: data.gender,
      address: data.address,
      nationalId: data.nationalId,
      departmentId: data.departmentId,
      roleId: data.roleId,
      branchId: data.branchId || undefined,
      supervisorId: data.supervisorId || undefined,
      mustChangePassword: true,
      passwordChangedAt: issuedAt,
      createdBy: actor.id,
    },
  });

  await auditLog({
    userId: actor.id, action: 'CREATE', module: 'HR',
    entityType: 'STAFF', entityId: staffId,
    description: `Created staff (${via}): ${data.firstName} ${data.lastName} (${employeeId})`,
    newValues: { employeeId, email: data.email, departmentId: data.departmentId, roleId: data.roleId },
  });

  return { staffId, employeeId, tempPassword };
}

/**
 * Emails a new staff member their sign-in details. Returns whether it went:
 * the caller still has the password on screen if it did not.
 */
export async function emailStaffLogin(params: {
  email: string;
  firstName: string;
  employeeId: string;
  tempPassword: string;
}): Promise<boolean> {
  const { email, firstName, employeeId, tempPassword } = params;
  const result = await sendEmail({
    to: email,
    subject: 'Your Hy-Link Finance staff account is ready',
    html: renderAlertEmail({
      title: 'Welcome to Hy-Link Finance',
      // Names can come from a public form; never let one carry markup into the email.
      recipientName: escapeHtml(firstName),
      message:
        'Your staff account has been created.<br/><br/>' +
        `<b>Employee ID:</b> ${employeeId}<br/>` +
        `<b>Email:</b> ${escapeHtml(email)}<br/>` +
        `<b>Temporary password:</b> <span style="font-family:monospace;font-size:16px;letter-spacing:1px;">${tempPassword}</span><br/><br/>` +
        'When you sign in you will be asked to set your own password. Do not share this password with anyone.',
      actionUrl: '/login',
      actionLabel: 'Sign in',
    }),
    text: `Welcome to Hy-Link Finance. Employee ID: ${employeeId} | Email: ${email} | Temporary password: ${tempPassword}. Sign in and set your own password.`,
  });
  return result.ok;
}
