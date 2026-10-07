'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ChevronRight, FileText, KeyRound, LogOut, Pencil, Phone, Receipt } from 'lucide-react';
import { FEE_STATE_LABEL } from '@/lib/fees';
import type { Portfolio } from '@/actions/portfolio.actions';
import { Amount } from './balance-privacy';
import { Divided, PageTitle, Panel, PORTAL_CARD } from './portal-ui';
import { StatusPill, formatDay } from './portfolio-bits';
import { ProfileDialog } from './portal-dialogs';

/** The customer's details, their applications and receipts, and account security. */
export function ProfileView({ data }: { data: Portfolio }) {
  const router = useRouter();
  const c = data.customer;
  const initials = c.name.split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle title="Profile" />

      <section className={`${PORTAL_CARD} flex items-center gap-4 p-5`}>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#002078] text-lg font-semibold text-white">{initials}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{c.name}</p>
          <p className="text-xs text-slate-500">Customer no. <span className="font-mono">{c.customerNumber}</span></p>
          {c.branch && <p className="text-xs text-slate-500">{c.branch}</p>}
        </div>
      </section>

      <Panel title="Contact details">
        <Divided>
          <Detail label="Phone" value={c.phone} />
          <Detail label="Email" value={c.email} />
          <Detail label="Address" value={c.address} />
          <ProfileDialog
            customer={c}
            onDone={() => router.refresh()}
            trigger={
              <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-[#002078] hover:bg-slate-50">
                <Pencil className="h-4 w-4" />Update contact details
              </button>
            }
          />
        </Divided>
      </Panel>

      {data.applications.length > 0 && (
        <Panel title="Applications and receipts">
          <Divided>
            {data.applications.map((a) => (
              <div key={a.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-slate-500"><span className="font-mono">{a.reference}</span> · {formatDay(a.submittedAt)}</p>
                  </div>
                  {a.status === 'APPROVED' ? <StatusPill label="Approved" tone="good" />
                    : a.status === 'REJECTED' ? <StatusPill label="Not approved" tone="bad" />
                    : <StatusPill label="Under review" tone="progress" />}
                </div>
                {a.fee && (
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <div className="flex justify-between gap-2">
                      <span>{a.fee.basis && a.fee.basis !== 'Registration fee' ? 'Processing fee' : 'Registration fee'} · {FEE_STATE_LABEL[a.fee.state]}</span>
                      <Amount value={a.fee.due} className="font-semibold text-slate-900" />
                    </div>
                    {a.fee.balance > 0 && <p className="mt-0.5">Still owed <Amount value={a.fee.balance} className="font-semibold text-rose-700" /></p>}
                    {a.fee.receipts.map((r) => (
                      <p key={r.receiptNumber} className="mt-1 flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5" /><span className="font-mono">{r.receiptNumber}</span> · <Amount value={r.amount} /> · {formatDay(r.date)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Divided>
        </Panel>
      )}

      <Panel title="Security and help">
        <Divided>
          <MenuLink href="/change-password" icon={KeyRound} label="Change password" />
          <MenuLink href={c.branchPhone ? `tel:${c.branchPhone.replace(/[^\d+]/g, '')}` : 'tel:+2349040964934'} icon={Phone} label={`Call ${c.branch ?? 'Hy-Link'}`} />
          <MenuLink href="https://www.hylinkfinance.com" icon={FileText} label="Hy-Link website" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />Sign out
          </button>
        </Divided>
      </Panel>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value || <span className="text-slate-400">Not given</span>}</span>
    </div>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-slate-50">
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-slate-300" />
    </Link>
  );
}
