'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Landmark, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Portfolio } from '@/actions/portfolio.actions';
import { Amount } from './balance-privacy';
import { Divided, EmptyState, ListRow, PageTitle, Panel, PORTAL_CARD } from './portal-ui';
import { ProgressBar, StatusPill, shortDay } from './portfolio-bits';
import { LoanApplyDialog } from './portal-dialogs';

/** Loans being repaid, applications on their way, and loans already finished. */
export function LoansView({ data }: { data: Portfolio }) {
  const router = useRouter();
  const repaying = data.loans.filter((l) => l.repaying);
  const pending = data.loans.filter((l) => !l.repaying && !['CLOSED', 'WRITTEN_OFF', 'REJECTED'].includes(l.status));
  const past = data.loans.filter((l) => ['CLOSED', 'WRITTEN_OFF', 'REJECTED'].includes(l.status));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle title="Loans" subtitle="What you owe and when it is due">
        <LoanApplyDialog
          onDone={() => router.refresh()}
          trigger={
            <button type="button" className="inline-flex items-center gap-1.5 rounded-xl bg-[#002078] px-4 py-2 text-sm font-semibold text-white hover:bg-[#001a63]">
              <Plus className="h-4 w-4" />Apply for a loan
            </button>
          }
        />
      </PageTitle>

      {repaying.length === 0 && pending.length === 0 && (
        <div className={PORTAL_CARD}>
          <EmptyState icon={Landmark} title="No active loans" body="When you take a loan, its balance, next payment and schedule show here." />
        </div>
      )}

      {repaying.map((l) => (
        <Link key={l.id} href={`/portal/loans/${l.id}`} className={`${PORTAL_CARD} block space-y-4 p-5 hover:border-slate-300`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{l.product}</p>
              <p className="text-xs text-slate-500">{l.loanNumber}</p>
            </div>
            <StatusPill label={l.stage.label} tone={l.stage.tone} />
          </div>
          <div>
            <p className="text-[11px] text-slate-500">Outstanding balance</p>
            <Amount value={l.outstanding} className="text-2xl font-bold" />
          </div>
          {l.next && (
            <div className={cn('flex items-center justify-between rounded-xl px-3 py-2.5 text-sm', l.overdue > 0 ? 'bg-rose-50 text-rose-900' : 'bg-slate-50')}>
              <span>{l.overdue > 0 ? 'Overdue now' : `Next payment · ${shortDay(l.next.dueDate)}`}</span>
              <Amount value={l.overdue > 0 ? l.overdue : l.next.amount} className="font-semibold" />
            </div>
          )}
          <ProgressBar
            value={l.progress}
            tone={l.overdue > 0 ? 'red' : 'green'}
            label={`${l.instalmentsPaid} of ${l.instalments} payments made`}
          />
        </Link>
      ))}

      {pending.length > 0 && (
        <Panel title="Applications">
          <Divided>
            {pending.map((l) => (
              <Link key={l.id} href={`/portal/loans/${l.id}`} className="block space-y-3 px-4 py-4 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.product}</p>
                    <p className="text-xs text-slate-500">{l.loanNumber} · applied {shortDay(l.applicationDate)}</p>
                  </div>
                  <Amount value={l.principal} className="shrink-0 text-sm font-semibold" />
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </div>
                <Steps step={l.stage.step} />
              </Link>
            ))}
          </Divided>
        </Panel>
      )}

      {past.length > 0 && (
        <Panel title="Past loans">
          <Divided>
            {past.map((l) => (
              <ListRow
                key={l.id}
                href={`/portal/loans/${l.id}`}
                icon={Landmark}
                tone="slate"
                title={l.product}
                subtitle={l.loanNumber}
                amount={l.principal}
                badge={<StatusPill label={l.stage.label} tone={l.stage.tone} />}
              />
            ))}
          </Divided>
        </Panel>
      )}
    </div>
  );
}

function Steps({ step }: { step: number }) {
  const steps = ['Applied', 'Checking', 'Approved', 'Paid out'];
  return (
    <ol className="grid grid-cols-4 gap-1.5 text-[11px]">
      {steps.map((s, i) => (
        <li key={s} className="space-y-1">
          <span className={cn('block h-1 rounded-full', i <= step ? 'bg-[#002078]' : 'bg-slate-200')} />
          <span className={i === step ? 'font-semibold text-slate-900' : 'text-slate-500'}>{s}</span>
        </li>
      ))}
    </ol>
  );
}
