'use server';

/**
 * Account Enquiries — Server Action
 * Hylink Finance Limited EMS
 *
 * The public "open an account" form. This is deliberately an enquiry, not a
 * registration: customer portal logins are provisioned by staff, who create the
 * customer record and send a temporary password. A self-service signup would
 * promise an account the system does not actually issue that way.
 *
 * This action is PUBLIC — it runs with no session. Everything here is written
 * on that basis: nothing is written to the database, the payload is validated
 * and length-capped, and a honeypot field catches the simplest bots.
 */

import { sendEmail } from '@/lib/email';
import { getConfig } from '@/lib/system-config';
import type { ActionResult } from '@/types';

export interface EnquiryInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  interest?: string;
  message?: string;
  /** Honeypot. Real people never see this field, so anything in it is a bot. */
  company?: string;
}

const MAX = { name: 60, email: 160, phone: 30, interest: 60, message: 1200 };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function submitAccountEnquiry(data: EnquiryInput): Promise<ActionResult> {
  try {
    // A filled honeypot is a bot. Report success so it learns nothing.
    if (data.company && data.company.trim().length > 0) {
      return { success: true, message: 'Thank you — we will be in touch shortly.' };
    }

    const firstName = (data.firstName ?? '').trim();
    const lastName = (data.lastName ?? '').trim();
    const email = (data.email ?? '').trim().toLowerCase();
    const phone = (data.phone ?? '').trim();
    const interest = (data.interest ?? '').trim();
    const message = (data.message ?? '').trim();

    if (!firstName || !lastName) {
      return { success: false, error: 'Please give your first and last name' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Please enter a valid email address' };
    }
    if (phone.replace(/\D/g, '').length < 7) {
      return { success: false, error: 'Please enter a valid phone number' };
    }
    if (
      firstName.length > MAX.name ||
      lastName.length > MAX.name ||
      email.length > MAX.email ||
      phone.length > MAX.phone ||
      interest.length > MAX.interest ||
      message.length > MAX.message
    ) {
      return { success: false, error: 'One of the fields is too long' };
    }

    const inbox = (await getConfig('company.email')) || 'info@hylinkfinance.com';
    const fullName = `${firstName} ${lastName}`;

    const rows: Array<[string, string]> = [
      ['Name', fullName],
      ['Email', email],
      ['Phone', phone],
    ];
    if (interest) rows.push(['Interested in', interest]);
    if (message) rows.push(['Message', message]);

    const result = await sendEmail({
      to: inbox,
      subject: `Account enquiry — ${fullName}`,
      html:
        `<h2 style="font-family:system-ui,sans-serif;">New account enquiry</h2>` +
        `<table style="font-family:system-ui,sans-serif;font-size:14px;border-collapse:collapse;">` +
        rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:6px 16px 6px 0;color:#64748b;vertical-align:top;">${label}</td>` +
              `<td style="padding:6px 0;"><strong>${escapeHtml(value)}</strong></td></tr>`
          )
          .join('') +
        `</table>` +
        `<p style="font-family:system-ui,sans-serif;font-size:13px;color:#64748b;margin-top:20px;">` +
        `Submitted from the website. Reply to the customer directly, then create their ` +
        `customer record in the EMS to issue a portal login.</p>`,
      text: rows.map(([label, value]) => `${label}: ${value}`).join('\n'),
    });

    if (!result.ok) {
      // The sender is not configured, or Resend rejected it. Say so plainly
      // rather than claiming an enquiry was received that nobody will see.
      console.error('Account enquiry could not be emailed:', result.error);
      return {
        success: false,
        error: 'We could not submit your enquiry just now. Please call us or try again shortly.',
      };
    }

    return {
      success: true,
      message: 'Thank you — your enquiry is in. Our team will contact you shortly.',
    };
  } catch (error: any) {
    console.error('Account enquiry failed:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
