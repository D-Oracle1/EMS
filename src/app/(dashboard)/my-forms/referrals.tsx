import Link from 'next/link';
import { Contact, ExternalLink, Link2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { getMyFormLinks, MyReferral } from '@/actions/referral.actions';
import { ShareFormButton } from '../forms/share-form-button';
import { FormQrButton } from '../forms/form-qr-button';

type Links = Awaited<ReturnType<typeof getMyFormLinks>>;

/**
 * A staff member's personal links to the customer forms, and the clients
 * they referred. A client who applies through one of these links is credited
 * to them; when what they applied for is opened or paid out it becomes their
 * sale (lib/referrals).
 */
export function ShareCustomerForms({ links, title = 'Share a customer form' }: { links: Links; title?: string }) {
  if (!links.code || links.forms.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Send className="h-5 w-5 text-indigo-600" />{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Send a client your personal link. Their application goes to the right officer as usual, and is credited to you.
          {links.earnsCommission
            ? ' When it is opened or paid out it becomes your sale, and earns commission once confirmed.'
            : ' You are shown as the referrer; commission is for Marketing staff and staff on sales targets.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {links.forms.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
            <span className="icon-tile icon-tile-sm icon-tile-indigo"><Contact className="h-4 w-4" /></span>
            <div className="min-w-[10rem] flex-1">
              <p className="font-medium">{f.title}</p>
              <p className="text-xs text-muted-foreground">{f.kind}{f.branch ? ` · ${f.branch}` : ''}</p>
            </div>
            {/* Under the name on a phone, beside it on a wider screen. */}
            <div className="flex w-full gap-2 sm:w-auto [&>*:first-child]:flex-1 sm:[&>*:first-child]:flex-none">
              <ShareFormButton slug={f.slug} title={f.title} by={f.credited ? links.code! : undefined} variant="full" />
              <FormQrButton slug={f.slug} title={f.title} by={f.credited ? links.code! : undefined} />
              {/* Fill it in with a client in the office, still credited to you. */}
              <Button variant="outline" size="icon" asChild>
                <Link
                  href={`/f/${f.slug}${f.credited ? `?by=${encodeURIComponent(links.code!)}` : ''}`}
                  target="_blank"
                  aria-label={`Open ${f.title}`}
                  title="Open the form"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        ))}
        <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" />Your links end in <span className="font-mono">?by={links.code}</span>
        </p>
      </CardContent>
    </Card>
  );
}

const STAGE: Record<MyReferral['stage'], { label: string; variant: 'secondary' | 'warning' | 'success' | 'destructive' }> = {
  SUBMITTED: { label: 'Applied', variant: 'secondary' },
  APPROVED: { label: 'Approved', variant: 'warning' },
  OPENED: { label: 'Opened', variant: 'success' },
  REJECTED: { label: 'Not approved', variant: 'destructive' },
};

export function MyReferrals({ referrals }: { referrals: MyReferral[] }) {
  if (referrals.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">My referrals ({referrals.length})</CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {referrals.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className="font-medium">{r.client}</p>
              <p className="text-xs text-muted-foreground">
                {r.kind} · <span className="font-mono">{r.reference}</span> · {formatDate(r.submittedAt)}
                {r.amount ? ` · ${formatCurrency(r.amount)}` : ''}
              </p>
              {r.opened && (
                <p className="text-xs text-muted-foreground">
                  {r.opened.label}{!r.opened.paidOut ? ' · not yet paid out' : ''}
                </p>
              )}
            </div>
            <div className="text-xs sm:text-right">
              <Badge variant={STAGE[r.stage].variant}>{STAGE[r.stage].label}</Badge>
              {r.sale && (
                <p className="mt-1 text-muted-foreground">
                  Sale <span className="font-mono">{r.sale.reference}</span> ·{' '}
                  {r.sale.status === 'CONFIRMED'
                    ? <>commission {r.sale.commission != null ? formatCurrency(r.sale.commission) : '-'}{r.sale.commissionPaid ? ', paid' : ', owed'}</>
                    : r.sale.status === 'REJECTED' ? 'rejected' : 'awaiting confirmation'}
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
