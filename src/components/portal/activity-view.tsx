'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Portfolio } from '@/actions/portfolio.actions';
import { markMyNotificationsRead } from '@/actions/portal.actions';
import { Divided, EmptyState, PageTitle, PORTAL_CARD, TransactionRow, dayLabel, groupByDay } from './portal-ui';

const subscribeHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

type Notice = { id: string; title: string; message: string; createdAt: string; isRead: boolean };

/** Transactions by day, and messages from Hy-Link. */
export function ActivityView({ data, notices }: { data: Portfolio; notices: { unread: number; items: Notice[] } }) {
  const router = useRouter();
  // The bell links to #messages: open on Messages then, until the customer picks a tab.
  const fromLink = useSyncExternalStore(subscribeHash, () => window.location.hash === '#messages', () => false);
  const [picked, setTab] = useState<'transactions' | 'messages' | null>(null);
  const tab = picked ?? (fromLink ? 'messages' : 'transactions');
  const days = groupByDay(data.activity);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageTitle title="Activity" />

      <div className="grid grid-cols-2 rounded-xl bg-slate-200/60 p-1 text-sm font-medium" role="tablist">
        {(['transactions', 'messages'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn('rounded-lg py-2 capitalize', tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
          >
            {t}{t === 'messages' && notices.unread > 0 ? ` (${notices.unread})` : ''}
          </button>
        ))}
      </div>

      {tab === 'transactions' ? (
        days.length === 0 ? (
          <div className={PORTAL_CARD}><EmptyState icon={ListOrdered} title="No transactions yet" /></div>
        ) : (
          days.map((d) => (
            <section key={d.label} className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{d.label}</h2>
              <div className={PORTAL_CARD}>
                <Divided>{d.items.map((t) => <TransactionRow key={t.id} t={t} />)}</Divided>
              </div>
            </section>
          ))
        )
      ) : (
        <section id="messages" className="space-y-2">
          {notices.unread > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs font-semibold text-[#002078] hover:underline"
                onClick={async () => { await markMyNotificationsRead(); router.refresh(); }}
              >
                Mark all as read
              </button>
            </div>
          )}
          <div className={PORTAL_CARD}>
            {notices.items.length === 0 ? (
              <EmptyState icon={Bell} title="No messages" body="Interest credits, payments and updates from Hy-Link appear here." />
            ) : (
              <Divided>
                {notices.items.map((n) => (
                  <div key={n.id} className="flex gap-3 px-4 py-3">
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-transparent' : 'bg-[#002078]')} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className={cn('text-sm', n.isRead ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</p>
                        <span className="shrink-0 text-[11px] text-slate-400">{dayLabel(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>
                    </div>
                  </div>
                ))}
              </Divided>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
