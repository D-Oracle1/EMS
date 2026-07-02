import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendEmail, renderAlertEmail } from '@/lib/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hylink-ems.vercel.app';

/** Generate a readable temporary password (no ambiguous characters). */
export function generateOtp(len = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[randomInt(chars.length)];
  return s;
}

/**
 * Provision a portal login for a customer: generate a temporary password,
 * enable the portal, force a reset on first login, and email the credentials.
 * Best-effort and idempotent — does nothing if the customer has no email or
 * already has a password. Safe to call after any customer-creation path.
 */
export async function provisionCustomerLogin(customerId: string): Promise<void> {
  try {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, firstName: true, passwordHash: true, isDeleted: true },
    });
    if (!c || c.isDeleted || !c.email || c.passwordHash) return;

    const otp = generateOtp();
    const passwordHash = await bcrypt.hash(otp, 12);

    await prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash, portalEnabled: true, mustResetPassword: true },
    });

    await sendEmail({
      to: c.email,
      subject: 'Your Hylink Finance online account is ready',
      html: renderAlertEmail({
        title: 'Welcome to Hylink Finance',
        recipientName: c.firstName ?? undefined,
        message:
          'An online account has been created for you so you can view your loans, savings and statements.<br/><br/>' +
          `<b>Email:</b> ${c.email}<br/>` +
          `<b>Temporary password:</b> <span style="font-family:monospace;font-size:16px;letter-spacing:1px;">${otp}</span><br/><br/>` +
          'When you sign in you will be asked to set a new password. For your security, do not share this password with anyone.',
        actionUrl: '/login',
        actionLabel: 'Sign in',
      }),
      text: `Welcome to Hylink Finance. Email: ${c.email} | Temporary password: ${otp}. Sign in at ${APP_URL}/login and set a new password.`,
    });
  } catch (error) {
    console.error('[customer-auth] provisionCustomerLogin failed:', error);
  }
}
