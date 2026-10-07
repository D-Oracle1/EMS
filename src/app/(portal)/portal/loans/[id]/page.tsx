import { notFound, redirect } from 'next/navigation';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { auth } from '@/lib/auth';
import type { SessionUser } from '@/types';
import { cn } from '@/lib/utils';
import { getMyLoan } from '@/actions/portfolio.actions';
import {
  BackToPortfolio, Fact, Money, PrintButton, ProgressBar, StatusPill, formatDay,
} from '@/components/portal/portfolio-bits';

const MODE: Record<string, string> = {
  CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', POS: 'POS', MOBILE_MONEY: 'Mobile money', CHEQUE: 'Cheque', DIRECT_DEBIT: 'Direct debit',
};
const INSTALMENT: Record<string, { label: string; tone: 'good' | 'progress' | 'bad' | 'done' }> = {
  PAID: { label: 'Paid', tone: 'good' },
  PARTIAL: { label: 'Part paid', tone: 'progress' },
  PENDING: { label: 'Due', tone: 'done' },
  OVERDUE: { label: 'Overdue', tone: 'bad' },
  WAIVED: { label: 'Waived', tone: 'done' },
};

/** One loan, as the borrower sees it: what is left, what is next, and every payment. */
export default async function MyLoanPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');
  if ((session.user as SessionUser).userType !== 'customer') redirect('/dashboard');
  const { id } = await params;
  const l = await getMyLoan(id);
  if (!l) notFound();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-6 animate-rise">
      <div className="flex items-center justify-between gap-2">
        <BackToPortfolio />
        <PrintButton label="Loan statement" />
      </div>

      <section className="premium-card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">{l.product}</h1>
            <p className="text-xs text-muted-foreground">Loan {l.loanNumber} · applied {formatDay(l.applicationDate)}</p>
          </div>
          <StatusPill label={l.stage.label} tone={l.stage.tone} />
        </div>

        {l.repaying ? (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Still to pay</p>
              <Money value={l.outstanding} className="text-4xl font-bold tracking-tight" />
            </div>
            {l.next && (
              <div className={cn('flex items-center gap-3 rounded-xl p-3 text-sm',
                l.overdue > 0 ? 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100' : 'bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100')}>
                {l.overdue > 0 ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CalendarClock className="h-5 w-5 shrink-0" />}
                <span>
                  {l.overdue > 0
                    ? <><Money value={l.overdue} className="font-semibold" /> is overdue. Please pay as soon as you can: default charges are added every day.</>
                    : <>Next payment <Money value={l.next.amount} className="font-semibold" /> on {formatDay(l.next.dueDate)} (instalment {l.next.installmentNumber}).</>}
                </span>
              </div>
            )}
            <ProgressBar
              value={l.progress}
              tone={l.overdue > 0 ? 'red' : 'green'}
              label={`${l.instalmentsPaid} of ${l.instalments} instalments paid · ${Math.round(l.progress * 100)}% of the loan repaid`}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {l.status === 'REJECTED'
              ? 'This application was not approved.'
              : l.status === 'CLOSED'
                ? 'This loan is fully repaid. Thank you.'
                : 'Your application is being processed. You will be told as it moves forward.'}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3">
          <Fact label="Amount borrowed"><Money value={l.principal} /></Fact>
          <Fact label="Interest">{l.interestRate}% a year · <Money value={l.totalInterest} /></Fact>
          <Fact label="Total to repay"><Money value={l.totalRepayment} /></Fact>
          <Fact label="Term">{l.tenure} months</Fact>
          <Fact label="Instalment"><Money value={l.instalmentAmount} /></Fact>
          <Fact label="Repaid so far"><Money value={l.repaid} /></Fact>
          {l.disbursed && <Fact label="Paid out to you"><Money value={l.disbursed.amount} /> on {formatDay(l.disbursed.date)}</Fact>}
          {l.maturityDate && <Fact label="Final payment due">{formatDay(l.maturityDate)}</Fact>}
          {l.purpose && <Fact label="Purpose">{l.purpose}</Fact>}
          {l.guarantors.length > 0 && <Fact label="Guarantors">{l.guarantors.join(', ')}</Fact>}
        </dl>

        {l.penaltyRate ? (
          <p className="text-xs text-muted-foreground">
            If an instalment is not paid within {l.graceDays} day{l.graceDays === 1 ? '' : 's'} of its due date, a default charge of {l.penaltyRate}% of
            the unpaid amount is added each day until it is paid.
            {l.chargesOwed > 0 && <> You owe <Money value={l.chargesOwed} className="font-semibold text-rose-700 dark:text-rose-300" /> in default charges now.</>}
          </p>
        ) : null}
      </section>

      {l.schedule.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Repayment schedule</h2>
          <div className="premium-card overflow-x-auto p-0">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Due</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2 text-right font-medium">Paid</th>
                  <th className="px-2 py-2 text-right font-medium">Charges owed</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {l.schedule.map((s) => {
                  const late = s.status !== 'PAID' && new Date(s.dueDate) < today && s.paid < s.due;
                  const st = late ? INSTALMENT.OVERDUE : INSTALMENT[s.status] ?? INSTALMENT.PENDING;
                  return (
                    <tr key={s.installmentNumber} className="border-t">
                      <td className="px-4 py-2 tabular-nums">{s.installmentNumber}</td>
                      <td className="whitespace-nowrap px-2 py-2">{formatDay(s.dueDate)}</td>
                      <td className="px-2 py-2 text-right tabular-nums"><Money value={s.due} /></td>
                      <td className="px-2 py-2 text-right tabular-nums"><Money value={s.paid} /></td>
                      <td className="px-2 py-2 text-right tabular-nums">{s.charges > 0 ? <Money value={s.charges} className="text-rose-700 dark:text-rose-300" /> : '-'}</td>
                      <td className="px-4 py-2"><StatusPill {...st} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Payments you have made</h2>
        <div className="premium-card divide-y p-0">
          {l.repayments.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No payments yet.</p>
          ) : l.repayments.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{formatDay(r.date)} · {MODE[r.mode] ?? r.mode}</p>
                <p className="text-xs text-muted-foreground">
                  Receipt <span className="font-mono">{r.receiptNumber}</span>
                  {' '}· interest <Money value={r.interest} /> · principal <Money value={r.principal} />
                  {r.charges > 0 && <> · charges <Money value={r.charges} /></>}
                </p>
              </div>
              <Money value={r.amount} className="font-semibold" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
