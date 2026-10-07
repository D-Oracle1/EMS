'use client';

import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowUpRight, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { getMySavings } from '@/actions/portfolio.actions';
import { Amount } from '@/components/portal/balance-privacy';
import {
  DetailRow, Divided, EmptyState, HeroBadge, HeroCard, IconTile, Panel, PORTAL_CARD, groupByDay,
} from '@/components/portal/portal-ui';
import { BackToPortfolio, PrintButton, accountStatus, formatDay } from '@/components/portal/portfolio-bits';
import { WithdrawDialog } from '@/components/portal/portal-dialogs';

type Account = NonNullable<Awaited<ReturnType<typeof getMySavings>>>;

/** One savings plan: where it stands, what it has earned, its terms, and its statement. */
export function SavingsDetail({ account: s }: { account: Account }) {
  const router = useRouter();
  const st = accountStatus(s.status);
  const most = Math.max(...s.interestByMonth.map((m) => m.amount), 0);
  const days = groupByDay([...s.statement].reverse());

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <BackToPortfolio href="/portal/accounts" label="Accounts" />
        <PrintButton label="Statement" />
      </div>

      <div className="px-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{s.product}</h1>
        <p className="text-sm text-slate-500">Account {s.accountNumber}</p>
      </div>

      <HeroCard
        label="Balance"
        amount={s.balance}
        badge={<HeroBadge tone={st.tone === 'good' ? 'good' : st.tone === 'bad' ? 'bad' : 'plain'}>{st.label}</HeroBadge>}
        sub={s.rate != null && s.months ? `${s.rate}% over ${s.months} months` : undefined}
        figures={[
          { label: 'Interest earned', value: s.earned, sign: '+', tone: 'good' },
          { label: s.maturityDate ? 'Expected at maturity' : 'Deposited', value: s.maturityDate ? s.atMaturity : s.deposited },
        ]}
      >
        {s.progress != null && (
          <div className="mt-4 space-y-1.5 print:hidden">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(s.progress * 100)}%` }} />
            </div>
            <p className="text-[11px] text-blue-100/80">
              {Math.round(s.progress * 100)}% of the term{s.maturityDate ? ` · matures ${formatDay(s.maturityDate)}` : ''}
            </p>
          </div>
        )}
      </HeroCard>

      {s.status === 'ACTIVE' && (
        <WithdrawDialog
          accountId={s.id}
          accountNumber={s.accountNumber}
          balance={s.balance}
          onDone={() => router.refresh()}
          trigger={
            <button type="button" className="w-full rounded-2xl bg-[#002078] py-3.5 text-sm font-semibold text-white hover:bg-[#001a63] print:hidden">
              Request a withdrawal
            </button>
          }
        />
      )}

      {s.pendingDeposits > 0 && (
        <p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <Amount value={s.pendingDeposits} className="font-semibold" /> of your recent deposits starts earning interest from next month.
        </p>
      )}

      <Panel title="Plan details">
        <Divided>
          <DetailRow label="You have deposited"><Amount value={s.deposited} /></DetailRow>
          {s.interestTarget != null && <DetailRow label="Interest for the full term"><Amount value={s.interestTarget} /></DetailRow>}
          {s.rate != null && <DetailRow label="Rate">{s.rate}%{s.months ? ` over ${s.months} months` : ''}</DetailRow>}
          <DetailRow label="Started">{formatDay(s.startDate)}</DetailRow>
          {s.earningStartDate && <DetailRow label="Interest counts from">{formatDay(s.earningStartDate)}</DetailRow>}
          {s.maturityDate && <DetailRow label="Matures">{formatDay(s.maturityDate)}</DetailRow>}
        </Divided>
      </Panel>

      {s.interestByMonth.length > 0 && (
        <Panel title="Interest by month">
          <ul className="space-y-2.5 p-4">
            {s.interestByMonth.map((m) => (
              <li key={m.month} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="text-slate-500">
                  {new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-NG', { month: 'short', year: '2-digit' })}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <span className="block h-full rounded-full bg-[#2a78d6]" style={{ width: `${most ? (m.amount / most) * 100 : 0}%` }} />
                </span>
                <Amount value={m.amount} className="font-medium" />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-slate-900">Statement</h2>
        {days.length === 0 ? (
          <div className={PORTAL_CARD}><EmptyState icon={ListOrdered} title="No transactions yet" /></div>
        ) : (
          days.map((d) => (
            <div key={d.label} className="space-y-1.5">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{d.label}</p>
              <div className={PORTAL_CARD}>
                <Divided>
                  {d.items.map((t) => (
                    <div key={t.id} className={cn('flex items-center gap-3 px-4 py-3', t.reversed && 'opacity-50')}>
                      <IconTile icon={t.direction === 'in' ? ArrowDownLeft : ArrowUpRight} tone={t.direction === 'in' ? 'green' : 'slate'} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm font-medium text-slate-900', t.reversed && 'line-through')}>{t.type}{t.reversed ? ' (reversed)' : ''}</p>
                        <p className="truncate text-xs text-slate-500">{t.narration ?? t.ref}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <Amount value={t.amount} sign={t.direction === 'in' ? '+' : '-'} className={cn('block text-sm font-semibold', t.direction === 'in' && 'text-emerald-700')} />
                        <span className="text-[11px] text-slate-500">Bal. <Amount value={t.balance} /></span>
                      </div>
                    </div>
                  ))}
                </Divided>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
