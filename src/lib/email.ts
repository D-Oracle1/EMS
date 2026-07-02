import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'Hylink Finance <onboarding@resend.dev>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hylink-ems.vercel.app';

const resend = apiKey ? new Resend(apiKey) : null;

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/** Best-effort email send. Never throws — returns a result object. */
export async function sendEmail(params: SendEmailParams): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — email skipped');
    return { ok: false, error: 'Email not configured' };
  }
  const recipients = (Array.isArray(params.to) ? params.to : [params.to]).filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: 'No recipients' };

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: recipients,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    if (error) {
      console.error('[email] Resend error:', error);
      return { ok: false, error: (error as { message?: string }).message || 'Send failed' };
    }
    return { ok: !!data };
  } catch (e) {
    console.error('[email] send failed:', e);
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Branded HTML for an alert email (deep blue + orange to match the app).
 */
export function renderAlertEmail(opts: {
  title: string;
  message: string;
  recipientName?: string;
  actionUrl?: string;
  actionLabel?: string;
}): string {
  const href = opts.actionUrl
    ? opts.actionUrl.startsWith('http')
      ? opts.actionUrl
      : `${APP_URL}${opts.actionUrl.startsWith('/') ? '' : '/'}${opts.actionUrl}`
    : null;

  const button = href
    ? `<a href="${href}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:9999px;">${opts.actionLabel || 'Open Hylink EMS'}</a>`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
      <div style="background:linear-gradient(135deg,#0b1b3f 0%,#1d4ed8 100%);border-radius:20px 20px 0 0;padding:22px 24px;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.2px;">Hylink Finance</div>
        <div style="color:#bfdbfe;font-size:12px;">Enterprise Management System</div>
      </div>
      <div style="background:#ffffff;border-radius:0 0 20px 20px;padding:26px 24px;box-shadow:0 10px 30px -12px rgba(16,24,40,0.18);">
        ${opts.recipientName ? `<p style="margin:0 0 6px;color:#64748b;font-size:13px;">Hi ${opts.recipientName},</p>` : ''}
        <h1 style="margin:0 0 12px;color:#0f172a;font-size:18px;font-weight:700;">${opts.title}</h1>
        <p style="margin:0 0 20px;color:#334155;font-size:14px;line-height:1.6;">${opts.message}</p>
        ${button}
        <div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:16px;color:#94a3b8;font-size:11px;line-height:1.5;">
          This is an automated alert from Hylink Finance EMS. If a button doesn't work, sign in at
          <a href="${APP_URL}" style="color:#1d4ed8;">${APP_URL.replace(/^https?:\/\//, '')}</a>.
        </div>
      </div>
    </div>
  </body>
</html>`;
}
