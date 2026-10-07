'use client';

import { AlertTriangle, CalendarClock, Check, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { getMyLoan } from '@/actions/portfolio.actions';
import { Amount } from './balance-privacy';
import { DetailRow, Divided, EmptyState, HeroBadge, HeroCard, ListRow, Panel, PORTAL_CARD } from './portal-ui';
import { BackToPortfolio, PrintButton, formatDay, shortDay } from './portfolio-bits';

type Loan = NonNullable<Awaited<ReturnType<typeof getMyLoan>>>;

const MODE: Record<string, string> = {
  CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', POS: 'POS', MOBILE_MONEY: 'Mobile money', CHEQUE: 'Cheque', DIRECT_DEBIT: 'Direct debit',
};

/** One loan, as a bank app shows it: what is left, what is next, the details, the schedule and every payment. */
export function LoanDetailView({ loan: l }: { loan: Loan }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const steps = ['Applied', 'Checking', 'Approved', 'Paid out'];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <BackToPortfolio href="/portal/loans" label="Loans" />
        <PrintButton label="Statement" />
      </div>

      <div className="px-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{l.product}</h1>
        <p className="text-sm text-slate-500">Loan {l.loanNumber} · applied {formatDay(l.applicationDate)}</p>
      </div>

      <HeroCard
        label={l.repaying ? 'Outstanding balance' : l.status === 'CLOSED' ? 'Amount borrowed' : 'Amount applied for'}
        amount={l.repaying ? l.outstanding : l.principal}
        badge={<HeroBadge tone={l.stage.tone === 'bad' ? 'bad' : l.stage.tone === 'good' ? 'good' : 'plain'}>{l.stage.label}</HeroBadge>}
        sub={l.repaying ? `${l.instalmentsPaid} of ${l.instalments} payments made` : undefined}
        figures={
          l.repaying || l.status === 'CLOSED'
            ? [
                { label: 'Repaid so far', value: l.repaid, tone: 'good' as const },
                { label: 'Total to repay', value: l.totalRepayment },
              ]
            : [
                { label: 'Total to repay', value: l.totalRepayment },
                { label: 'Each instalment', value: l.instalmentAmount },
              ]
        }
      >
        {l.repaying && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15 print:hidden" aria-hidden>
            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(l.progress * 100)}%` }} />
          </div>
        )}
      </HeroCard>

      {l.repaying && l.next && (
        <div className={cn('flex items-center gap-3 rounded-2xl border p-4', l.overdue > 0 ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50')}>
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', l.overdue > 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700')}>
            {l.overdue > 0 ? <AlertTriangle className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('text-sm font-semibold', l.overdue > 0 ? 'text-rose-900' : 'text-amber-900')}>
              {l.overdue > 0 ? 'Payment overdue' : 'Next payment'}
            </p>
            <p className="text-xs text-slate-600">
              {l.overdue > 0 ? 'Please pay as soon as you can: charges are added daily' : `Due ${shortDay(l.next.dueDate)} · instalment ${l.next.installmentNumber}`}
            </p>
          </div>
          <Amount value={l.overdue > 0 ? l.overdue : l.next.amount} className="shrink-0 text-sm font-bold text-slate-900" />
        </div>
      )}

      {!l.repaying && !['CLOSED', 'WRITTEN_OFF'].includes(l.status) && (
        <section className={`${PORTAL_CARD} space-y-3 p-4`}>
          <p className="text-sm font-semibold">{l.status === 'REJECTED' ? 'This application was not approved' : 'Your application is in progress'}</p>
          {l.status !== 'REJECTED' && (
            <ol className="grid grid-cols-4 gap-1.5 text-[11px]">
              {steps.map((s, i) => (
                <li key={s} className="space-y-1">
                  <span className={cn('block h-1 rounded-full', i <= l.stage.step ? 'bg-[#002078]' : 'bg-slate-200')} />
                  <span className={i === l.stage.step ? 'font-semibold text-slate-900' : 'text-slate-500'}>{s}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <Panel title="Loan details">
        <Divided>
          <DetailRow label="Amount borrowed"><Amount value={l.principal} /></DetailRow>
          <DetailRow label="Interest">{l.interestRate}% a year · <Amount value={l.totalInterest} /></DetailRow>
          <DetailRow label="Each instalment"><Amount value={l.instalmentAmount} /></DetailRow>
          <DetailRow label="Term">{l.tenure} months</DetailRow>
          {l.disbursed && <DetailRow label="Paid out to you"><Amount value={l.disbursed.amount} /> · {shortDay(l.disbursed.date)}</DetailRow>}
          {l.maturityDate && <DetailRow label="Final payment due">{formatDay(l.maturityDate)}</DetailRow>}
          {l.purpose && <DetailRow label="Purpose">{l.purpose}</DetailRow>}
          {l.guarantors.length > 0 && <DetailRow label="Guarantors">{l.guarantors.join(', ')}</DetailRow>}
          {l.chargesOwed > 0 && <DetailRow label="Default charges owed"><Amount value={l.chargesOwed} className="text-rose-700" /></DetailRow>}
        </Divided>
        {l.penaltyRate ? (
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            A payment not made within {l.graceDays} day{l.graceDays === 1 ? '' : 's'} of its due date is charged {l.penaltyRate}% of the unpaid
            amount each day until paid.
          </p>
        ) : null}
      </Panel>

      {l.schedule.length > 0 && (
        <Panel title="Repayment schedule">
          <Divided>
            {l.schedule.map((s) => {
              const paid = s.status === 'PAID';
              const late = !paid && new Date(s.dueDate) < today && s.paid < s.due;
              const part = !paid && s.paid > 0;
              return (
                <div key={s.installmentNumber} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    paid ? 'bg-emerald-50 text-emerald-700' : late ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600')}>
                    {paid ? <Check className="h-4 w-4" /> : s.installmentNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{formatDay(s.dueDate)}</p>
                    <p className={cn('text-xs', late ? 'text-rose-700' : 'text-slate-500')}>
                      {paid ? 'Paid' : late ? 'Overdue' : part ? <>Part paid · <Amount value={s.paid} /></> : 'Due'}
                      {s.charges > 0 && <> · charges <Amount value={s.charges} /></>}
                    </p>
                  </div>
                  <Amount value={s.due} className={cn('shrink-0 text-sm font-semibold', paid && 'text-slate-400 line-through decoration-slate-300')} />
                </div>
              );
            })}
          </Divided>
        </Panel>
      )}

      <Panel title="Payments made">
        {l.repayments.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments yet" />
        ) : (
          <Divided>
            {l.repayments.map((r) => (
              <ListRow
                key={r.id}
                icon={Receipt}
                tone="green"
                title={formatDay(r.date)}
                subtitle={`${r.receiptNumber} · ${MODE[r.mode] ?? r.mode}`}
                amount={r.amount}
              />
            ))}
          </Divided>
        )}
      </Panel>
    </div>
  );
}
