import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import type { SessionUser } from '@/types';
import { getMyDeposit } from '@/actions/portfolio.actions';
import { BrandLogo } from '@/components/brand';
import {
  BackToPortfolio, Fact, Money, PrintButton, ProgressBar, StatusPill, accountStatus, formatDay,
} from '@/components/portal/portfolio-bits';

const PAYMENT: Record<string, string> = { AT_MATURITY: 'At maturity', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly' };
const ON_MATURITY: Record<string, string> = {
  ROLLOVER_PRINCIPAL_AND_INTEREST: 'Roll over principal and interest',
  ROLLOVER_PRINCIPAL_ONLY: 'Roll over principal, pay out interest',
  PAY_OUT: 'Pay out',
  TRANSFER_TO_SAVINGS: 'Move to savings',
};

/** A fixed deposit as its certificate: what was placed, the terms, and what it pays. */
export default async function MyDepositPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');
  if ((session.user as SessionUser).userType !== 'customer') redirect('/dashboard');
  const { id } = await params;
  const d = await getMyDeposit(id);
  if (!d) notFound();

  return (
    <div className="space-y-6 animate-rise">
      <div className="flex items-center justify-between gap-2">
        <BackToPortfolio />
        <PrintButton label="Certificate" />
      </div>

      <section className="premium-card space-y-5 p-6 print:border-2 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <BrandLogo className="w-32" />
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Fixed deposit certificate</p>
            <p className="font-mono text-lg font-bold">{d.certificateNumber}</p>
            <StatusPill {...accountStatus(d.status)} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <Fact label="Holder" strong>{d.holder}</Fact>
          <Fact label="Customer number">{d.customerNumber}</Fact>
          <Fact label="Amount placed" strong><Money value={d.principal} /></Fact>
          <Fact label="Interest rate">{d.rate}% a year</Fact>
          <Fact label="Start date">{formatDay(d.startDate)}</Fact>
          <Fact label="Maturity date">{formatDay(d.maturityDate)}</Fact>
          <Fact label="Term">{d.tenureDays} days</Fact>
          <Fact label="Interest paid">{PAYMENT[d.interestPayment] ?? d.interestPayment}</Fact>
          <Fact label="Interest for the term"><Money value={d.interestAmount} /></Fact>
          <Fact label="You receive at maturity" strong><Money value={d.maturityAmount} /></Fact>
          <Fact label="At maturity">{ON_MATURITY[d.maturityInstruction] ?? d.maturityInstruction}</Fact>
          {d.branch && <Fact label="Branch">{d.branch}</Fact>}
        </dl>

        {d.status === 'ACTIVE' && (
          <div className="space-y-2 border-t pt-4 print:hidden">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>Interest earned so far <Money value={d.accruedInterest} className="font-semibold text-emerald-700 dark:text-emerald-300" /></span>
              <span className="text-muted-foreground">{d.daysLeft} days to maturity</span>
            </div>
            <ProgressBar value={d.progress} />
          </div>
        )}
        {d.paidOut != null && (
          <p className="border-t pt-4 text-sm">
            Paid out <Money value={d.paidOut} className="font-semibold" />{d.closedAt ? ` on ${formatDay(d.closedAt)}` : ''}.
          </p>
        )}

        <p className="border-t pt-4 text-[11px] text-muted-foreground">
          Hy-Link Finance Limited · Head office: Suite 24, Long John Plaza, 34 Agip Road, Rumueme, Port Harcourt · 0904 096 4934.
          This certificate shows Hy-Link&apos;s record of your deposit on the day it was printed.
        </p>
      </section>
    </div>
  );
}
