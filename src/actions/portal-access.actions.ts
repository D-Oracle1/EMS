'use server';

/**
 * Customer portal access — Server Actions
 * Hylink Finance Limited EMS
 *
 * A customer signs in to their portfolio (/portal) with their email or phone
 * number. There is no SMS service, so staff give access: issuing it makes a
 * one-time password, shown once on the officer's screen to hand over or read
 * out (and emailed too, when the customer has an email). The customer must
 * replace it at first sign-in. Issuing again replaces the old password and
 * unlocks an account locked by failed attempts.
 *
 * Who: staff who open accounts for customers, within their branch scope.
 */

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { branchScopeFor } from '@/lib/branch-scope';
import { generateTempPassword } from '@/lib/temp-password';
import { sendEmail, renderAlertEmail } from '@/lib/email';
import { phoneKey } from '@/lib/customer-forms';
import type { ActionResult, SessionUser } from '@/types';

/** Who may give a customer portal access: anyone who opens customers' accounts or updates their records. */
const PORTAL_ACCESS_PERMISSIONS = [
  'CUSTOMERS:UPDATE', 'CUSTOMERS:CREATE', 'SAVINGS:CREATE', 'FIXED_DEPOSITS:CREATE', 'LOANS:CREATE',
];

const canGiveAccess = (user: SessionUser) => PORTAL_ACCESS_PERMISSIONS.some((p) => user.permissions.includes(p));

async function customerInScope(user: SessionUser, customerId: string) {
  const scope = await branchScopeFor(user);
  return prisma.customer.findFirst({
    where: { id: String(customerId).slice(0, 64), isDeleted: false, ...(scope ? { branchId: scope } : {}) },
    select: {
      id: true, customerNumber: true, firstName: true, lastName: true, email: true, phone: true, status: true,
      portalEnabled: true, passwordHash: true, mustResetPassword: true, portalLastLoginAt: true, portalLockedUntil: true,
    },
  });
}

/** Others with portal access on the same phone: that number cannot sign anyone in. */
async function sharedPhone(customerId: string, phone: string) {
  const key = phoneKey(phone);
  if (!key) return 0;
  return prisma.customer.count({ where: { id: { not: customerId }, phone: { endsWith: key }, portalEnabled: true, isDeleted: false } });
}

export async function getPortalAccess(customerId: string) {
  const { user } = await getSession();
  if (!canGiveAccess(user)) return null;
  const c = await customerInScope(user, customerId);
  if (!c) return null;
  return {
    enabled: c.portalEnabled && !!c.passwordHash,
    waitingFirstSignIn: c.portalEnabled && c.mustResetPassword,
    lastLoginAt: c.portalLastLoginAt?.toISOString() ?? null,
    locked: !!c.portalLockedUntil && c.portalLockedUntil > new Date(),
    email: c.email,
    phone: c.phone,
    phoneShared: (await sharedPhone(c.id, c.phone)) > 0,
    active: c.status === 'ACTIVE',
  };
}

/** Gives (or resets) portal access. The password is returned once, to show the officer. */
export async function issuePortalAccess(customerId: string): Promise<ActionResult<{ password: string; signInWith: string[]; emailed: boolean; phoneShared: boolean }>> {
  try {
    const { user } = await getSession();
    if (!canGiveAccess(user)) return { success: false, error: 'Permission denied' };
    const c = await customerInScope(user, customerId);
    if (!c) return { success: false, error: 'Customer not found' };
    if (c.status !== 'ACTIVE') return { success: false, error: 'Only an active customer can be given portal access' };

    const password = generateTempPassword();
    await prisma.customer.update({
      where: { id: c.id },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        portalEnabled: true,
        mustResetPassword: true,
        portalFailedAttempts: 0,
        portalLockedUntil: null,
      },
    });

    const shared = (await sharedPhone(c.id, c.phone)) > 0;
    const signInWith = [...(c.email ? [c.email] : []), ...(shared ? [] : [c.phone])];

    let emailed = false;
    if (c.email) {
      const sent = await sendEmail({
        to: c.email,
        subject: 'Your Hy-Link Finance portfolio login',
        html: renderAlertEmail({
          title: 'See your Hy-Link portfolio online',
          recipientName: c.firstName,
          message:
            'You can now sign in to see your savings, deposits and loans.<br/><br/>' +
            `<b>Sign in with:</b> ${signInWith.join(' or ')}<br/>` +
            `<b>One-time password:</b> <span style="font-family:monospace;font-size:16px;letter-spacing:1px;">${password}</span><br/><br/>` +
            'You will be asked to set your own password. Never share your password with anyone, including Hy-Link staff.',
          actionUrl: '/login',
          actionLabel: 'Sign in',
        }),
        text: `Sign in to your Hy-Link portfolio with ${signInWith.join(' or ')}. One-time password: ${password}`,
      }).catch(() => ({ ok: false }));
      emailed = sent.ok;
    }

    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'UPDATE', module: 'CUSTOMERS', entityType: 'CUSTOMER_PORTAL_ACCESS', entityId: c.id,
      description: `${c.portalEnabled ? 'Reset' : 'Gave'} portal access for ${c.customerNumber} ${c.firstName} ${c.lastName}${emailed ? ' (emailed)' : ''}`,
    });
    return { success: true, message: 'Portal access ready', data: { password, signInWith, emailed, phoneShared: shared } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not give portal access' };
  }
}

/** Switches a customer's portal access off. Their records are untouched. */
export async function revokePortalAccess(customerId: string): Promise<ActionResult> {
  try {
    const { user } = await getSession();
    if (!canGiveAccess(user)) return { success: false, error: 'Permission denied' };
    const c = await customerInScope(user, customerId);
    if (!c) return { success: false, error: 'Customer not found' };
    await prisma.customer.update({ where: { id: c.id }, data: { portalEnabled: false, passwordHash: null } });
    await auditLog({
      userId: user.id, userEmail: user.email, userRole: user.roleCode,
      action: 'UPDATE', module: 'CUSTOMERS', entityType: 'CUSTOMER_PORTAL_ACCESS', entityId: c.id,
      description: `Switched off portal access for ${c.customerNumber} ${c.firstName} ${c.lastName}`,
    });
    return { success: true, message: 'Portal access switched off' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Could not switch off portal access' };
  }
}
