import Link from 'next/link';
import { ArrowUp, ArrowDown, ArrowUpRight } from 'lucide-react';

/**
 * The stat card used across the application.
 *
 * A soft rounded card with a tinted icon tile, an optional donut ring and a
 * coloured accent bar down the right edge. One colour token drives all three,
 * so they can never drift apart — see the `.sc-*` rules in globals.css.
 *
 * Palette names mirror the sidebar, so a module's cards carry the same colour
 * as its nav entry.
 */
export type StatColor =
  | 'blue' | 'cyan' | 'orange' | 'emerald' | 'purple' | 'yellow' | 'sky'
  | 'pink' | 'violet' | 'indigo' | 'teal' | 'amber' | 'rose' | 'fuchsia' | 'slate';

export interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  description?: string;
  /** Sidebar palette colour. Falls back to `variant` when omitted. */
  color?: StatColor;
  /** Legacy prop kept so older call sites still work; `color` wins over it. */
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  /** A secondary figure shown after the main value, as in "200 - 42". */
  secondaryValue?: string | number;
  /** 0-100. Renders the donut ring. Only pass a real ratio. */
  progress?: number;
  /** Percentage change. Renders the delta pill; the sign picks the colour. */
  delta?: number;
  href?: string;
  className?: string;
}

/**
 * Full class names spelled out, so Tailwind's scanner finds each one in the
 * source and keeps its rule. Composing the name (`sc-` + tone) lets Tailwind
 * purge every colour rule out of @layer components — the cards then render
 * with the right classes and no colour at all.
 */
const COLOR_CLASS: Record<StatColor, string> = {
  blue: 'sc-blue',
  cyan: 'sc-cyan',
  orange: 'sc-orange',
  emerald: 'sc-emerald',
  purple: 'sc-purple',
  yellow: 'sc-yellow',
  sky: 'sc-sky',
  pink: 'sc-pink',
  violet: 'sc-violet',
  indigo: 'sc-indigo',
  teal: 'sc-teal',
  amber: 'sc-amber',
  rose: 'sc-rose',
  fuchsia: 'sc-fuchsia',
  slate: 'sc-slate',
};

const VARIANT_COLOR: Record<NonNullable<StatCardProps['variant']>, StatColor> = {
  default: 'slate',
  success: 'emerald',
  warning: 'amber',
  danger: 'rose',
  info: 'blue',
};

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  color,
  variant = 'default',
  secondaryValue,
  progress,
  delta,
  href,
  className = '',
}: StatCardProps) {
  const tone = color ?? VARIANT_COLOR[variant];
  const showRing = typeof progress === 'number';
  const showDelta = typeof delta === 'number';

  const deltaClass =
    !showDelta || delta === 0
      ? 'stat-delta-flat'
      : delta > 0
        ? 'stat-delta-up'
        : 'stat-delta-down';

  const content = (
    <div className="p-5 pr-7">
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <div className="stat-icon">
            <Icon className="h-5 w-5" />
          </div>
        ) : (
          <span />
        )}

        <div className="flex flex-col items-end gap-1.5">
          {showDelta && (
            <span className={`stat-delta ${deltaClass}`}>
              {delta > 0 ? (
                <ArrowUp className="h-3 w-3" />
              ) : delta < 0 ? (
                <ArrowDown className="h-3 w-3" />
              ) : null}
              {Math.abs(delta)}%
            </span>
          )}
          {showRing ? (
            <div
              className="stat-ring"
              style={{ ['--sc-progress' as string]: Math.max(0, Math.min(100, progress)) }}
              role="img"
              aria-label={`${Math.round(progress)}%`}
            >
              <span>{Math.round(progress)}%</span>
            </div>
          ) : (
            href && <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      <p className={`text-sm text-muted-foreground ${Icon ? 'mt-4' : 'mt-1'}`}>{title}</p>

      <p className="mt-0.5 flex items-baseline gap-1.5 text-[1.75rem] font-bold leading-tight tracking-tight">
        {value}
        {secondaryValue !== undefined && (
          <span className="text-base font-semibold text-muted-foreground">- {secondaryValue}</span>
        )}
      </p>

      {description && <p className="mt-1 text-xs text-muted-foreground/80">{description}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={`stat-card ${COLOR_CLASS[tone]} block ${className}`}>
        {content}
      </Link>
    );
  }

  return (
    <div className={`stat-card ${COLOR_CLASS[tone]} stat-card-hover ${className}`}>{content}</div>
  );
}
