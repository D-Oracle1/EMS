'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Bell, CalendarClock, ChevronRight, FileText, Landmark, Loader2,
  PiggyBank, Receipt, ShieldCheck, TrendingUp, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDateTime } from '@/lib/utils';
import { getMyNotifications, markMyNotificationsRead } from '@/actions/portal.actions';
import { getMyPortfolio, type Portfolio } from '@/actions/portfolio.actions';
import { FEE_STATE_LABEL } from '@/lib/fees';
import {
  AllocationBar, Money, ProgressBar, StatusPill, accountStatus, formatDay,
} from '@/components/portal/portfolio-bits';
import { LoanApplyDialog, ProfileDialog } from '@/components/portal/portal-dialogs';

type Notice = { id: string; title: string; message: string; createdAt: string; isRead: boolean };

/** The customer's whole Hy-Link portfolio on one screen, each holding opening its own page. */
export function PortalClient() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [failed, setFailed] = useState(false);
  const [notices, setNotices] = useState<{ unread: number; items: Notice[] }>({ unread: 0, items: [] });

  // setState only inside promise callbacks: the screen starts in its loading state.
  const refetch = () => {
    getMyPortfolio().then(setData).catch((e) => { setFailed(true); toast.error(e.message); });
    getMyNotifications(20).then((r) => setNotices(r as never)).catch(() => undefined);
  };
  useEffect(() => { refetch(); }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        {failed ? 'Your portfolio could not be loaded. Please try again.' : <><Loader2 className="mr-2 h-6 w-6 animate-spin" />Loading your portfolio…</>}
      </div>
    );
  }

  const { totals } = data;
  const overdueLoans = data.loans.filter((l) => l.overdue > 0);
  const savings = data.savings.filter((s) => s.held || s.status === 'ACTIVE');
  const pastSavings = data.savings.filter((s) => !savings.includes(s));
  const deposits = data.deposits.filter((d) => d.held);
  const pastDeposits = data.deposits.filter((d) => !d.held);
  const nothing = !data.savings.length && !data.deposits.length && !data.loans.length;

  return (
    <div className="space-y-6 animate-rise">
      {/* Who and when */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Hello, {data.customer.firstName}</h1>
          <p className="text-xs text-muted-foreground">
            Customer {data.customer.customerNumber}{data.customer.branch ? ` · ${data.customer.branch}` : ''} · figures as of {formatDateTime(data.asOf)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LoanApplyDialog onDone={refetch} />
          <ProfileDialog customer={data.customer} onDone={refetch} />
        </div>
      </div>

      {/* The headline: what they have with Hy-Link */}
      <section className="premium-card space-y-5 p-5">
        <div>
          <p className="text-sm text-muted-foreground">Your money with Hy-Link</p>
          <Money value={totals.invested} className="block text-4xl font-bold tracking-tight sm:text-5xl" />
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Headline label="Interest earned so far" value={totals.earned} tone="good" />
          <Headline label="Expected at maturity" value={totals.atMaturity} hint="If nothing is added or withdrawn" />
          <Headline label="Owed on loans" value={totals.owed} tone={totals.owed > 0 ? 'owe' : undefined} />
          <Headline label="Net position" value={totals.net} hint="Your money less what you owe" />
        </dl>
        {totals.allocation.length > 0 && (
          <div className="border-t pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Where your money is</p>
            <AllocationBar items={totals.allocation} />
          </div>
        )}
      </section>

      {overdueLoans.length > 0 && (
        <Link
          href={`/portal/loans/${overdueLoans[0].id}`}
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">A loan payment is overdue.</span>{' '}
            <Money value={overdueLoans.reduce((t, l) => t + l.overdue, 0)} /> is past due on loan {overdueLoans.map((l) => l.loanNumber).join(', ')}.
            Default charges are added every day until it is paid.
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" />
        </Link>
      )}

      {nothing && (
        <section className="premium-card p-6 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-blue-600" />
          <p className="mt-3 font-semibold">Your portfolio is ready</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your savings, deposits and loans appear here as soon as they are opened. Visit or call {data.customer.branch ?? 'your branch'}
            {data.customer.branchPhone ? ` on ${data.customer.branchPhone}` : ''} to start.
          </p>
        </section>
      )}

      {/* Coming up */}
      {data.upcoming.length > 0 && (
        <Section icon={CalendarClock} title="Coming up" tone="text-blue-600">
          <div className="premium-card divide-y">
            {data.upcoming.slice(0, 6).map((u, i) => (
              <Link key={`${u.href}-${i}`} href={u.href} className="flex items-center gap-3 p-3 hover:bg-muted/40">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-[11px] uppercase text-muted-foreground">{new Date(u.date).toLocaleDateString('en-NG', { month: 'short' })}</p>
                  <p className="text-lg font-bold leading-none">{new Date(u.date).getDate()}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.title}</p>
                  <p className={cn('text-xs', u.kind === 'OVERDUE' ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground')}>
                    {u.kind === 'MATURITY' ? 'You receive' : u.kind === 'OVERDUE' ? 'Overdue: please pay' : 'Payment due'}
                  </p>
                </div>
                <Money value={u.amount} className="shrink-0 text-sm font-semibold" />
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Savings and partnerships */}
      {savings.length > 0 && (
        <Section icon={PiggyBank} title="Savings" tone="text-emerald-600">
          {savings.map((s) => {
            const st = accountStatus(s.status);
            return (
              <Link key={s.id} href={`/portal/savings/${s.id}`} className="premium-card block space-y-3 p-4 hover:ring-1 hover:ring-blue-300">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.product}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.accountNumber}{s.rate != null && s.months ? ` · ${s.rate}% over ${s.months} months` : ''}
                    </p>
                  </div>
                  <StatusPill {...st} />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <Money value={s.balance} className="text-2xl font-bold" />
                    {s.earned > 0 && <p className="text-xs text-emerald-700 dark:text-emerald-300">+<Money value={s.earned} /> interest earned</p>}
                  </div>
                  {s.maturityDate && (
                    <div className="text-right text-xs text-muted-foreground">
                      <p>At maturity <Money value={s.atMaturity} className="font-semibold text-foreground" /></p>
                      <p>{formatDay(s.maturityDate)}</p>
                    </div>
                  )}
                </div>
                <ProgressBar value={s.progress} label={s.progress != null ? `${Math.round(s.progress * 100)}% of the term` : undefined} />
              </Link>
            );
          })}
        </Section>
      )}

      {/* Fixed deposits */}
      {deposits.length > 0 && (
        <Section icon={TrendingUp} title="Fixed deposits" tone="text-violet-600">
          {deposits.map((d) => (
            <Link key={d.id} href={`/portal/deposits/${d.id}`} className="premium-card block space-y-3 p-4 hover:ring-1 hover:ring-blue-300">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">Certificate {d.certificateNumber}</p>
                  <p className="text-xs text-muted-foreground">{d.rate}% a year · {d.tenureDays} days</p>
                </div>
                <StatusPill {...accountStatus(d.status)} />
              </div>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <Money value={d.principal} className="text-2xl font-bold" />
                  {d.earned > 0 && <p className="text-xs text-emerald-700 dark:text-emerald-300">+<Money value={d.earned} /> interest so far</p>}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>You receive <Money value={d.atMaturity} className="font-semibold text-foreground" /></p>
                  <p>{formatDay(d.maturityDate)}{d.status === 'ACTIVE' ? ` · ${d.daysLeft} days left` : ''}</p>
                </div>
              </div>
              <ProgressBar value={d.progress} />
            </Link>
          ))}
        </Section>
      )}

      {/* Loans */}
      {data.loans.length > 0 && (
        <Section icon={Landmark} title="Loans" tone="text-orange-600">
          {data.loans.map((l) => (
            <Link key={l.id} href={`/portal/loans/${l.id}`} className="premium-card block space-y-3 p-4 hover:ring-1 hover:ring-blue-300">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.product}</p>
                  <p className="text-xs text-muted-foreground">{l.loanNumber} · <Money value={l.principal} /> over {l.tenure} months</p>
                </div>
                <StatusPill label={l.stage.label} tone={l.stage.tone} />
              </div>
              {l.repaying ? (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Still to pay</p>
                      <Money value={l.outstanding} className="text-2xl font-bold" />
                      {l.chargesOwed > 0 && <p className="text-xs text-rose-700 dark:text-rose-300">includes <Money value={l.chargesOwed} /> default charges</p>}
                    </div>
                    {l.next && (
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Next payment <Money value={l.next.amount} className="font-semibold text-foreground" /></p>
                        <p>{formatDay(l.next.dueDate)}</p>
                      </div>
                    )}
                  </div>
                  <ProgressBar
                    value={l.progress}
                    tone={l.overdue > 0 ? 'red' : 'green'}
                    label={`${l.instalmentsPaid} of ${l.instalments} instalments paid · ${Math.round(l.progress * 100)}% of the loan repaid`}
                  />
                </>
              ) : (
                <LoanSteps step={l.stage.step} rejected={l.status === 'REJECTED'} />
              )}
            </Link>
          ))}
        </Section>
      )}

      {/* Applications and receipts */}
      {data.applications.length > 0 && (
        <Section icon={FileText} title="Applications and receipts" tone="text-indigo-600">
          <div className="premium-card divide-y">
            {data.applications.map((a) => (
              <div key={a.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground"><span className="font-mono">{a.reference}</span> · {formatDay(a.submittedAt)}</p>
                  </div>
                  {a.status === 'APPROVED' ? <StatusPill label="Approved" tone="good" />
                    : a.status === 'REJECTED' ? <StatusPill label="Not approved" tone="bad" />
                    : <StatusPill label="Under review" tone="progress" />}
                </div>
                {a.fee && (
                  <div className="rounded-xl bg-muted/50 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{a.fee.basis && a.fee.basis !== 'Registration fee' ? `Processing fee (${a.fee.basis})` : 'Registration fee'}</span>
                      <span className="font-medium">{FEE_STATE_LABEL[a.fee.state]}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fee <Money value={a.fee.due} />
                      {a.fee.discount > 0 && <> · discount <Money value={a.fee.discount} /></>}
                      {' '}· paid <Money value={a.fee.paid} />
                      {a.fee.balance > 0 && <> · <span className="font-semibold text-foreground">still owed <Money value={a.fee.balance} /></span></>}
                    </p>
                    {a.fee.receipts.map((r) => (
                      <p key={r.receiptNumber} className="mt-1 flex items-center gap-1.5 text-xs">
                        <Receipt className="h-3.5 w-3.5" /><span className="font-mono">{r.receiptNumber}</span> · <Money value={r.amount} /> · {formatDay(r.date)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Money moving */}
      {data.activity.length > 0 && (
        <Section icon={Wallet} title="Recent activity" tone="text-slate-600">
          <div className="premium-card divide-y">
            {data.activity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  a.direction === 'in' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300')}>
                  {a.direction === 'in' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.detail} · {formatDateTime(a.date)}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {a.direction === 'in' ? '+' : '−'}<Money value={a.amount} />
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Messages */}
      {notices.items.length > 0 && (
        <Section
          icon={Bell}
          title="Messages"
          tone="text-emerald-600"
          extra={notices.unread > 0 ? (
            <Button variant="ghost" size="sm" className="text-xs" onClick={async () => {
              await markMyNotificationsRead();
              getMyNotifications(20).then((r) => setNotices(r as never)).catch(() => undefined);
            }}>
              Mark {notices.unread} read
            </Button>
          ) : undefined}
        >
          <div className="premium-card divide-y">
            {notices.items.slice(0, 8).map((n) => (
              <div key={n.id} className={cn('p-3', !n.isRead && 'bg-emerald-50/50 dark:bg-emerald-500/5')}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{n.title}{!n.isRead && <Badge variant="success" className="ml-2 text-[10px]">New</Badge>}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {(pastSavings.length > 0 || pastDeposits.length > 0) && (
        <Section icon={FileText} title="Closed accounts" tone="text-slate-500">
          <div className="premium-card divide-y">
            {pastSavings.map((s) => (
              <Link key={s.id} href={`/portal/savings/${s.id}`} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40">
                <span className="min-w-0 truncate">{s.product} · {s.accountNumber}</span>
                <StatusPill {...accountStatus(s.status)} />
              </Link>
            ))}
            {pastDeposits.map((d) => (
              <Link key={d.id} href={`/portal/deposits/${d.id}`} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40">
                <span className="min-w-0 truncate">Fixed deposit {d.certificateNumber}</span>
                <StatusPill {...accountStatus(d.status)} />
              </Link>
            ))}
          </div>
        </Section>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        These figures come straight from Hy-Link&apos;s records. If anything looks wrong, contact {data.customer.branch ?? 'your branch'}
        {data.customer.branchPhone ? ` on ${data.customer.branchPhone}` : ''}. Hy-Link staff will never ask for your password.
      </p>
    </div>
  );
}

function Headline({ label, value, tone, hint }: { label: string; value: number; tone?: 'good' | 'owe'; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-lg font-semibold', tone === 'good' && 'text-emerald-700 dark:text-emerald-300', tone === 'owe' && 'text-rose-700 dark:text-rose-300')}>
        <Money value={value} />
      </dd>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ icon: Icon, title, tone, extra, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; tone: string; extra?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Icon className={cn('h-4 w-4', tone)} />{title}</h2>
        {extra}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** A loan not yet paid out: where it is on the way. */
function LoanSteps({ step, rejected }: { step: number; rejected: boolean }) {
  const steps = ['Applied', 'Being checked', 'Approved', 'Paid out'];
  return (
    <ol className="flex items-center gap-1.5 text-[11px]">
      {steps.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cn('h-1.5 rounded-full',
            rejected && i === step ? 'bg-rose-500' : i <= step ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-200 dark:bg-slate-700')} />
          <span className={cn('truncate', i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>{rejected && i === step ? 'Not approved' : s}</span>
        </li>
      ))}
    </ol>
  );
}
