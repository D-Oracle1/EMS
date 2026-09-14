'use client';

/**
 * The clock and greeting that open every staff workspace.
 *
 * Modelled on the reference design: a greeting pill, a large tabular clock and
 * the date beneath it, sitting on the frosted ground. Every staff member sees
 * the time on their own dashboard without leaving the system.
 *
 * The clock ticks client-side. It renders nothing until mounted, because the
 * server has no way to know the viewer's timezone and rendering the server's
 * idea of "now" would flash the wrong time before correcting itself.
 */

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface WorkspaceHeaderProps {
  /** Shown under the clock in place of the date, e.g. a branch name. */
  subtitle?: string;
  /** Seconds are distracting on a dashboard; on by default only for a wall clock. */
  showSeconds?: boolean;
  /**
   * 'full' is the centrepiece from the reference design, reserved for the
   * dashboards. 'mini' is a clock-iconned chip that rides in the icon cluster
   * on the right, for working pages where 180px of clock above a table only
   * gets in the way.
   */
  variant?: 'full' | 'mini';
}

export function WorkspaceHeader({
  subtitle,
  showSeconds = false,
  variant = 'full',
}: WorkspaceHeaderProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    // Tick every second when seconds are shown, otherwise every fifteen — no
    // point waking the page 59 times to redraw the same minute.
    const period = showSeconds ? 1000 : 15000;
    const id = setInterval(() => setNow(new Date()), period);
    return () => clearInterval(id);
  }, [showSeconds]);

  const time = now
    ? now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        ...(showSeconds ? { second: '2-digit' } : {}),
        hour12: false,
      })
    : null;

  const date = now
    ? now.toLocaleDateString('en-NG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  // The chip in the right-hand icon cluster: a clock face and the time, sized
  // and hovered like the round buttons it sits beside so the cluster reads as
  // one row. The full date rides along as a tooltip, so nothing is actually
  // lost by shrinking it.
  if (variant === 'mini') {
    return (
      <span
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tabular-nums tracking-tight text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        title={subtitle ?? date ?? undefined}
        suppressHydrationWarning
      >
        <Clock className="h-4 w-4 shrink-0" aria-hidden />
        {time ?? '--:--'}
      </span>
    );
  }

  return (
    <div className="relative">
      <div className="py-6 text-center sm:py-8">
        {/* Reserve the height so the surrounding layout does not jump when the
            clock appears on mount. */}
        <p className="clock-time text-6xl font-bold sm:text-7xl md:text-8xl" suppressHydrationWarning>
          {time ?? ' '}
        </p>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base" suppressHydrationWarning>
          {subtitle ?? date ?? ' '}
        </p>
      </div>
    </div>
  );
}
