'use client';

import type { getMyDeposit } from '@/actions/portfolio.actions';
import { Amount } from './balance-privacy';
import { DetailRow, Divided, HeroBadge, HeroCard, Panel } from './portal-ui';
import { BackToPortfolio, PrintButton, accountStatus, formatDay } from './portfolio-bits';

type Deposit = NonNullable<Awaited<ReturnType<typeof getMyDeposit>>>;

const PAYMENT: Record<string, string> = { AT_MATURITY: 'At maturity', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly' };
const ON_MATURITY: Record<string, string> = {
  ROLLOVER_PRINCIPAL_AND_INTEREST: 'Roll over principal and interest',
  ROLLOVER_PRINCIPAL_ONLY: 'Roll over principal, pay out interest',
  PAY_OUT: 'Pay out to you',
  TRANSFER_TO_SAVINGS: 'Move to your savings',
};

/** One fixed deposit: what was placed, what it has earned, and what it pays at maturity. Prints as its certificate. */
export function DepositDetailView({ deposit: d }: { deposit: Deposit }) {
  const st = accountStatus(d.status);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-2">
        <BackToPortfolio href="/portal/accounts" label="Accounts" />
        <PrintButton label="Certificate" />
      </div>

      <div className="px-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Fixed deposit</h1>
        <p className="text-sm text-slate-500">Certificate {d.certificateNumber} · {d.holder}</p>
      </div>

      <HeroCard
        label="Amount placed"
        amount={d.principal}
        badge={<HeroBadge tone={st.tone === 'good' ? 'good' : 'plain'}>{st.label}</HeroBadge>}
        sub={`${d.rate}% a year · ${d.tenureDays} days`}
        figures={[
          { label: 'Interest so far', value: d.accruedInterest, sign: '+', tone: 'good' },
          { label: 'You receive at maturity', value: d.maturityAmount },
        ]}
      >
        {d.status === 'ACTIVE' && d.progress != null && (
          <div className="mt-4 space-y-1.5 print:hidden">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(d.progress * 100)}%` }} />
            </div>
            <p className="text-[11px] text-blue-100/80">{d.daysLeft} days to maturity · {formatDay(d.maturityDate)}</p>
          </div>
        )}
      </HeroCard>

      <Panel title="Deposit details">
        <Divided>
          <DetailRow label="Holder">{d.holder}</DetailRow>
          <DetailRow label="Customer number">{d.customerNumber}</DetailRow>
          <DetailRow label="Start date">{formatDay(d.startDate)}</DetailRow>
          <DetailRow label="Maturity date">{formatDay(d.maturityDate)}</DetailRow>
          <DetailRow label="Interest rate">{d.rate}% a year</DetailRow>
          <DetailRow label="Interest for the term"><Amount value={d.interestAmount} /></DetailRow>
          <DetailRow label="Interest paid">{PAYMENT[d.interestPayment] ?? d.interestPayment}</DetailRow>
          <DetailRow label="At maturity">{ON_MATURITY[d.maturityInstruction] ?? d.maturityInstruction}</DetailRow>
          {d.branch && <DetailRow label="Branch">{d.branch}</DetailRow>}
          {d.paidOut != null && (
            <DetailRow label="Paid out"><Amount value={d.paidOut} />{d.closedAt ? ` · ${formatDay(d.closedAt)}` : ''}</DetailRow>
          )}
        </Divided>
      </Panel>

      <p className="px-1 text-center text-[11px] text-slate-400">
        Hy-Link Finance Limited · Suite 24, Long John Plaza, 34 Agip Road, Rumueme, Port Harcourt · 0904 096 4934.
        This shows Hy-Link&apos;s record of your deposit on the day it was viewed or printed.
      </p>
    </div>
  );
}
