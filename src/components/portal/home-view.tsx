'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, CalendarClock, FileText, HandCoins, Landmark, ListOrdered, Phone, PiggyBank, TrendingUp, Wallet,
} from 'lucide-react';
import type { Portfolio } from '@/actions/portfolio.actions';
import { Amount, PrivacyToggle } from './balance-privacy';
import { Divided, EmptyState, ListRow, Panel, TransactionRow } from './portal-ui';
import { shortDay } from './portfolio-bits';
import { LoanApplyDialog } from './portal-dialogs';

/**
 * Home, as a bank app opens: the balance card, quick actions, then only what
 * needs the customer now: a loan payment due, their accounts in brief, and
 * the last few transactions. Everything else is a tab away. Two columns on a
 * wide screen, one on a phone.
 */
export function HomeView({ data }: { data: Portfolio }) {
  const router = useRouter();
  const { totals, customer } = data;
  const accounts = [
    ...data.savings.filter((s) => s.held).map((s) => ({
      id: s.id, href: `/portal/savings/${s.id}`, icon: s.kind === 'PARTNERSHIP' ? HandCoins : PiggyBank,
      tone: s.kind === 'PARTNERSHIP' ? ('orange' as const) : ('navy' as const), title: s.product, subtitle: s.accountNumber, amount: s.balance,
    })),
    ...data.deposits.filter((d) => d.held).map((d) => ({
      id: d.id, href: `/portal/deposits/${d.id}`, icon: TrendingUp, tone: 'violet' as const,
      title: 'Fixed deposit', subtitle: d.certificateNumber, amount: d.principal,
    })),
  ];
  const due = data.loans
    .filter((l) => l.repaying && l.next)
    .sort((a, b) => a.next!.dueDate.localeCompare(b.next!.dueDate))[0];
  const call = customer.branchPhone ? `tel:${customer.branchPhone.replace(/[^\d+]/g, '')}` : 'tel:+2349040964934';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      {/* Left: the card, actions and accounts */}
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#001a63] via-[#002078] to-[#1446b8] p-5 text-white shadow-lg shadow-blue-950/20 sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border-[28px] border-white/[0.06]" aria-hidden />
          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-blue-100/90">Total balance</p>
              <PrivacyToggle className="-mr-1.5 text-blue-100 hover:bg-white/10" />
            </div>
            <Amount value={totals.invested} className="mt-1 block text-3xl font-bold tracking-tight sm:text-4xl" />
            <p className="mt-1 text-xs text-blue-100/80">Customer no. {customer.customerNumber}</p>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/15 pt-4">
              <div>
                <p className="text-[11px] text-blue-100/80">Interest earned</p>
                <Amount value={totals.earned} sign="+" className="text-sm font-semibold text-emerald-300" />
              </div>
              <div className="text-right">
                <p className="text-[11px] text-blue-100/80">{totals.owed > 0 ? 'Loan balance' : 'At maturity'}</p>
                <Amount value={totals.owed > 0 ? totals.owed : totals.atMaturity} className="text-sm font-semibold" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-4 gap-2">
          <QuickAction href="/portal/accounts" icon={Wallet} label="Accounts" />
          <LoanApplyDialog
            onDone={() => router.refresh()}
            trigger={<button type="button" className="block w-full"><QuickActionFace icon={Landmark} label="Get a loan" /></button>}
          />
          <QuickAction href="/portal/activity" icon={ListOrdered} label="History" />
          <QuickAction href={call} icon={Phone} label="Call us" />
        </section>

        <Panel title="My accounts" action={accounts.length > 4 ? { label: 'View all', href: '/portal/accounts' } : undefined}>
          {accounts.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No accounts yet"
              body={`Your savings and deposits appear here once opened. Visit or call ${customer.branch ?? 'your branch'} to start.`}
            />
          ) : (
            <Divided>
              {accounts.slice(0, 4).map((a) => (
                <ListRow key={a.id} href={a.href} icon={a.icon} tone={a.tone} title={a.title} subtitle={a.subtitle} amount={a.amount} />
              ))}
            </Divided>
          )}
        </Panel>
      </div>

      {/* Right: what is due, and what happened */}
      <div className="space-y-6">
        {due && (
          <Link
            href={`/portal/loans/${due.id}`}
            className={`block rounded-2xl border p-4 ${due.overdue > 0 ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}
          >
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${due.overdue > 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                {due.overdue > 0 ? <AlertTriangle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${due.overdue > 0 ? 'text-rose-900' : 'text-amber-900'}`}>
                  {due.overdue > 0 ? 'Payment overdue' : 'Next loan payment'}
                </p>
                <p className="text-xs text-slate-600">
                  {due.overdue > 0 ? 'Charges are added daily until paid' : `Due ${shortDay(due.next!.dueDate)} · ${due.loanNumber}`}
                </p>
              </div>
              <Amount value={due.overdue > 0 ? due.overdue : due.next!.amount} className="shrink-0 text-sm font-bold text-slate-900" />
            </div>
          </Link>
        )}

        <Panel title="Recent transactions" action={data.activity.length > 5 ? { label: 'See all', href: '/portal/activity' } : undefined}>
          {data.activity.length === 0 ? (
            <EmptyState icon={FileText} title="No transactions yet" />
          ) : (
            <Divided>
              {data.activity.slice(0, 5).map((t) => <TransactionRow key={t.id} t={t} />)}
            </Divided>
          )}
        </Panel>

        <p className="px-1 text-center text-[11px] text-slate-400">
          As of {new Date(data.asOf).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}.
          Hy-Link staff will never ask for your password.
        </p>
      </div>
    </div>
  );
}

function QuickActionFace({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <span className="flex flex-col items-center gap-1.5 py-1 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[#002078] shadow-sm">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] font-medium text-slate-700">{label}</span>
    </span>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className="block hover:opacity-80">
      <QuickActionFace icon={icon} label={label} />
    </Link>
  );
}
