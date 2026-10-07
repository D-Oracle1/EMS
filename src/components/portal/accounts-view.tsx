'use client';

import Link from 'next/link';
import { HandCoins, PiggyBank, TrendingUp, Wallet } from 'lucide-react';
import type { Portfolio } from '@/actions/portfolio.actions';
import { Amount, PrivacyToggle } from './balance-privacy';
import { Divided, EmptyState, ListRow, PageTitle, Panel, PORTAL_CARD } from './portal-ui';
import { AllocationBar, StatusPill, accountStatus } from './portfolio-bits';

/** Every savings plan and fixed deposit, with the totals across them. */
export function AccountsView({ data }: { data: Portfolio }) {
  const { totals } = data;
  const savings = data.savings.filter((s) => s.held);
  const deposits = data.deposits.filter((d) => d.held);
  const closed = [
    ...data.savings.filter((s) => !s.held).map((s) => ({ id: s.id, href: `/portal/savings/${s.id}`, title: s.product, subtitle: s.accountNumber, status: s.status })),
    ...data.deposits.filter((d) => !d.held).map((d) => ({ id: d.id, href: `/portal/deposits/${d.id}`, title: 'Fixed deposit', subtitle: d.certificateNumber, status: d.status })),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle title="Accounts" subtitle="Your savings and fixed deposits">
        <PrivacyToggle className="text-slate-500 hover:bg-slate-100" />
      </PageTitle>

      {savings.length === 0 && deposits.length === 0 ? (
        <div className={PORTAL_CARD}>
          <EmptyState
            icon={PiggyBank}
            title="No savings or fixed deposits yet"
            body={`Grow your money with a savings plan, the mutual partnership or a fixed deposit. Visit or call ${data.customer.branch ?? 'your branch'} to open one.`}
          >
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={data.customer.branchPhone ? `tel:${data.customer.branchPhone.replace(/[^\d+]/g, '')}` : 'tel:+2349040964934'}
                className="inline-flex items-center rounded-xl bg-[#002078] px-4 py-2 text-sm font-semibold text-white hover:bg-[#001a63]"
              >
                Call to open an account
              </a>
              {data.loans.length > 0 && (
                <Link href="/portal/loans" className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  View my loans
                </Link>
              )}
            </div>
          </EmptyState>
        </div>
      ) : (
        <>
        <section className={`${PORTAL_CARD} space-y-4 p-5`}>
          <dl className="space-y-4">
            <Figure label="Total balance" value={totals.invested} strong />
            <div className="grid grid-cols-2 gap-3">
              <Figure label="Interest earned" value={totals.earned} tone="text-emerald-700" />
              <Figure label="Expected at maturity" value={totals.atMaturity} />
            </div>
          </dl>
          {totals.allocation.length > 1 && (
            <div className="border-t border-slate-100 pt-4">
              <AllocationBar items={totals.allocation} />
            </div>
          )}
        </section>

        <Panel title="Savings">
          {savings.length === 0 ? (
            <EmptyState icon={PiggyBank} title="No savings plans" body="Ask your branch about our savings plans and the mutual partnership." />
          ) : (
            <Divided>
              {savings.map((s) => (
                <ListRow
                  key={s.id}
                  href={`/portal/savings/${s.id}`}
                  icon={s.kind === 'PARTNERSHIP' ? HandCoins : PiggyBank}
                  tone={s.kind === 'PARTNERSHIP' ? 'orange' : 'navy'}
                  title={s.product}
                  subtitle={s.accountNumber}
                  amount={s.balance}
                  amountNote={s.earned > 0 ? <Amount value={s.earned} sign="+" className="text-emerald-700" /> : undefined}
                />
              ))}
            </Divided>
          )}
        </Panel>

        <Panel title="Fixed deposits">
          {deposits.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No fixed deposits" body="A fixed deposit earns a set rate for 6, 12 or 18 months." />
          ) : (
            <Divided>
              {deposits.map((d) => (
                <ListRow
                  key={d.id}
                  href={`/portal/deposits/${d.id}`}
                  icon={TrendingUp}
                  tone="violet"
                  title="Fixed deposit"
                  subtitle={d.certificateNumber}
                  amount={d.principal}
                  amountNote={d.status === 'ACTIVE' ? `${d.daysLeft} days left` : undefined}
                />
              ))}
            </Divided>
          )}
        </Panel>
        </>
      )}

      {closed.length > 0 && (
        <Panel title="Closed">
          <Divided>
            {closed.map((c) => (
              <ListRow key={c.id} href={c.href} icon={Wallet} tone="slate" title={c.title} subtitle={c.subtitle} badge={<StatusPill {...accountStatus(c.status)} />} />
            ))}
          </Divided>
        </Panel>
      )}
    </div>
  );
}

function Figure({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd><Amount value={value} className={`block ${strong ? 'text-2xl font-bold' : 'text-sm font-semibold'} ${tone ?? ''}`} /></dd>
    </div>
  );
}
