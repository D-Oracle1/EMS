'use client';

import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Amount } from './balance-privacy';

/**
 * The customer app's building blocks, in a bank app's plain style: white
 * panels on a light grey page, lists with dividers, amounts right-aligned.
 */

export const PORTAL_CARD = 'rounded-2xl border border-slate-200 bg-white';

export function Panel({ title, action, children, className, id }: {
  title?: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('space-y-2', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-1">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {action && (
            <Link href={action.href} className="text-xs font-semibold text-[#002078] hover:underline">{action.label}</Link>
          )}
        </div>
      )}
      <div className={PORTAL_CARD}>{children}</div>
    </section>
  );
}

const TILE_TONE = {
  navy: 'bg-blue-50 text-[#002078]',
  orange: 'bg-orange-50 text-orange-600',
  green: 'bg-emerald-50 text-emerald-700',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
  red: 'bg-rose-50 text-rose-600',
} as const;
export type TileTone = keyof typeof TILE_TONE;

export function IconTile({ icon: Icon, tone = 'navy', className }: {
  icon: React.ComponentType<{ className?: string }>; tone?: TileTone; className?: string;
}) {
  return (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TILE_TONE[tone], className)}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** One account, loan or item in a list: icon, two lines on the left, amount on the right. */
export function ListRow({ href, icon, tone, title, subtitle, amount, amountNote, badge, sign }: {
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: TileTone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  amount?: number;
  amountNote?: React.ReactNode;
  badge?: React.ReactNode;
  sign?: '+' | '-';
}) {
  const body = (
    <>
      <IconTile icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-slate-900">{title}</p>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="shrink-0 text-right">
        {amount != null && (
          <Amount value={amount} sign={sign} className={cn('block text-sm font-semibold', sign === '+' && 'text-emerald-700')} />
        )}
        {amountNote && <span className="block text-[11px] text-slate-500">{amountNote}</span>}
        {badge && <span className="mt-0.5 block">{badge}</span>}
      </div>
      {href && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
    </>
  );
  const cls = 'flex items-center gap-3 px-4 py-3';
  return href ? <Link href={href} className={cn(cls, 'hover:bg-slate-50')}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Divided({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-slate-100">{children}</div>;
}

export function EmptyState({ icon: Icon, title, body, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; body?: string; children?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <Icon className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export type ActivityItem = { id: string; date: string; title: string; detail: string; amount: number; direction: 'in' | 'out' };

/** A money movement: in is green with a down-left arrow, out is grey with an up-right arrow. */
export function TransactionRow({ t }: { t: ActivityItem }) {
  const time = new Date(t.date).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
  return (
    <ListRow
      icon={t.direction === 'in' ? ArrowDownLeft : ArrowUpRight}
      tone={t.direction === 'in' ? 'green' : 'slate'}
      title={t.title}
      subtitle={`${t.detail} · ${time}`}
      amount={t.amount}
      sign={t.direction === 'in' ? '+' : '-'}
    />
  );
}

/** "Today", "Yesterday" or the date, for grouping a list by day. */
export function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function groupByDay<T extends { date: string }>(items: T[]): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  for (const it of items) {
    const label = dayLabel(it.date);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(it);
    else out.push({ label, items: [it] });
  }
  return out;
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
