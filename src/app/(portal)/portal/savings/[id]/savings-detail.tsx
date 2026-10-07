'use client';

import { useRouter } from 'next/navigation';
import { cn, formatDateTime } from '@/lib/utils';
import type { getMySavings } from '@/actions/portfolio.actions';
import {
  BackToPortfolio, Fact, Money, PrintButton, ProgressBar, StatusPill, accountStatus, formatDay,
} from '@/components/portal/portfolio-bits';
import { WithdrawDialog } from '@/components/portal/portal-dialogs';

type Account = NonNullable<Awaited<ReturnType<typeof getMySavings>>>;

/** One savings plan: where it stands, what it has earned, and its statement. */
export function SavingsDetail({ account: s }: { account: Account }) {
  const router = useRouter();
  const st = accountStatus(s.status);
  const most = Math.max(...s.interestByMonth.map((m) => m.amount), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:space-y-4">
      <div className="flex items-center justify-between gap-2">
        <BackToPortfolio href="/portal/accounts" label="Accounts" />
        <PrintButton label="Statement" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">{s.product}</h1>
            <p className="text-xs text-slate-500">Account {s.accountNumber}</p>
          </div>
          <StatusPill {...st} />
        </div>
        <div>
          <p className="text-xs text-slate-500">Balance</p>
          <Money value={s.balance} className="text-4xl font-bold tracking-tight" />
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="You have deposited"><Money value={s.deposited} /></Fact>
          <Fact label="Interest earned"><Money value={s.earned} className="text-emerald-700 dark:text-emerald-300" /></Fact>
          {s.interestTarget != null && <Fact label="Interest for the full term"><Money value={s.interestTarget} /></Fact>}
          {s.maturityDate && <Fact label="Expected at maturity"><Money value={s.atMaturity} /></Fact>}
          {s.rate != null && <Fact label="Rate">{s.rate}% {s.months ? `over ${s.months} months` : ''}</Fact>}
          <Fact label="Started">{formatDay(s.startDate)}</Fact>
          {s.maturityDate && <Fact label="Matures">{formatDay(s.maturityDate)}</Fact>}
          {s.earningStartDate && <Fact label="Interest counts from">{formatDay(s.earningStartDate)}</Fact>}
        </dl>
        <ProgressBar value={s.progress} label={s.progress != null ? `${Math.round(s.progress * 100)}% of the term complete` : undefined} />
        {s.pendingDeposits > 0 && (
          <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:bg-blue-500/10 dark:text-blue-100">
            <Money value={s.pendingDeposits} /> of recent deposits starts earning interest from next month.
          </p>
        )}
        {s.status === 'ACTIVE' && (
          <div className="print:hidden">
            <WithdrawDialog
              accountId={s.id}
              accountNumber={s.accountNumber}
              balance={s.balance}
              onDone={() => router.refresh()}
              trigger={
                <button type="button" className="w-full rounded-xl bg-[#002078] py-3 text-sm font-semibold text-white hover:bg-[#001a63] sm:w-auto sm:px-6">
                  Request a withdrawal
                </button>
              }
            />
          </div>
        )}
      </section>

      {s.interestByMonth.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Interest by month</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <ul className="space-y-1.5">
              {s.interestByMonth.map((m) => (
                <li key={m.month} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="text-slate-500">
                    {new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
                    <span className="block h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${most ? (m.amount / most) * 100 : 0}%` }} />
                  </span>
                  <Money value={m.amount} className="font-medium" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Statement</h2>
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto p-0">
          {s.statement.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No transactions yet.</p>
          ) : (
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Details</th>
                  <th className="px-2 py-2 text-right font-medium">In</th>
                  <th className="px-2 py-2 text-right font-medium">Out</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {[...s.statement].reverse().map((t) => (
                  <tr key={t.id} className={cn('border-t', t.reversed && 'text-slate-500 line-through')}>
                    <td className="whitespace-nowrap px-4 py-2">{formatDateTime(t.date)}</td>
                    <td className="px-2 py-2">
                      {t.type}
                      <span className="block font-mono text-[11px] text-slate-500">{t.ref}</span>
                      {t.narration && <span className="block text-[11px] text-slate-500">{t.narration}</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">{t.direction === 'in' ? <Money value={t.amount} /> : ''}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.direction === 'out' ? <Money value={t.amount} /> : ''}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums"><Money value={t.balance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
