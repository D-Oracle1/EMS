'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { Amount } from './balance-privacy';

/**
 * Pieces of the customer's portfolio screens.
 *
 * Holding colours are the dataviz reference palette's first three
 * categorical slots, validated together (scripts/validate_palette.js): light
 * on white, dark steps on the dark surface. Aqua is under 3:1 on white, so
 * every segment is also listed with its name, amount and share: colour is
 * never the only way to tell them apart.
 */
export const HOLDING_COLOR: Record<string, string> = {
  SAVINGS: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  PARTNERSHIP: 'bg-[#eb6834] dark:bg-[#d95926]',
  FIXED_DEPOSIT: 'bg-[#1baf7a] dark:bg-[#199e70]',
};

/** An amount, hidden with the rest when the customer hides their balances. */
export function Money({ value, className }: { value: number; className?: string }) {
  return <Amount value={value} className={className} />;
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A date for lists: "11 Oct", with the year only when it is not this year. */
export function shortDay(iso: string, now = new Date()) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

/** How far through a term or a loan: a thin track with a label. */
export function ProgressBar({ value, label, tone = 'blue' }: { value: number | null; label?: string; tone?: 'blue' | 'green' | 'red' }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-full',
            tone === 'green' ? 'bg-emerald-500' : tone === 'red' ? 'bg-rose-500' : 'bg-blue-600 dark:bg-blue-500'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && <p className="text-[11px] text-muted-foreground">{label}</p>}
    </div>
  );
}

/**
 * Where the customer's money sits: one stacked bar, 2px surface gaps between
 * segments, with the legend below naming each one's amount and share.
 */
export function AllocationBar({ items }: { items: { kind: string; label: string; value: number; share: number }[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden>
        {items.map((a) => (
          <div
            key={a.kind}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', HOLDING_COLOR[a.kind])}
            style={{ width: `${Math.max(a.share * 100, 1.5)}%` }}
            title={`${a.label}: ${Math.round(a.share * 100)}%`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-3">
        {items.map((a) => (
          <li key={a.kind} className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', HOLDING_COLOR[a.kind])} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{a.label}</span>
            <Amount value={a.value} className="font-medium" />
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{Math.round(a.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/30',
  progress: 'bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-200 dark:ring-blue-500/30',
  bad: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30',
  done: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/30',
};

/** A status in words, always with its label: colour only reinforces it. */
export function StatusPill({ label, tone }: { label: string; tone: keyof typeof STATUS_STYLE }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', STATUS_STYLE[tone])}>
      {label}
    </span>
  );
}

/** Savings and deposit statuses in plain words. */
export function accountStatus(status: string): { label: string; tone: keyof typeof STATUS_STYLE } {
  switch (status) {
    case 'ACTIVE': return { label: 'Active', tone: 'good' };
    case 'MATURED': return { label: 'Matured', tone: 'progress' };
    case 'DORMANT': return { label: 'Dormant', tone: 'bad' };
    case 'FROZEN': return { label: 'On hold', tone: 'bad' };
    case 'TERMINATION_REQUESTED': return { label: 'Early exit requested', tone: 'progress' };
    case 'WITHDRAWN': return { label: 'Paid out', tone: 'done' };
    case 'ROLLED_OVER': return { label: 'Rolled over', tone: 'done' };
    case 'PREMATURE_CLOSED': return { label: 'Closed early', tone: 'done' };
    default: return { label: status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), tone: 'done' };
  }
}

export function BackToPortfolio({ href = '/portal', label = 'Home' }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 print:hidden">
      <ArrowLeft className="h-4 w-4" />{label}
    </Link>
  );
}

export function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-muted print:hidden"
    >
      <Printer className="h-4 w-4" />{label}
    </button>
  );
}

/** A label above a value, for the detail screens. */
export function Fact({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('break-words', strong ? 'text-base font-semibold' : 'text-sm font-medium')}>{children}</dd>
    </div>
  );
}
