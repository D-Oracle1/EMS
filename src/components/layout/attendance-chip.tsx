'use client';

/**
 * Today's attendance, in the icon cluster.
 *
 * It deliberately does not clock you in. `clockIn()` is refused outright unless
 * hr.allowRemoteClockIn is switched on — attendance is meant to come from the
 * office QR code — and the attendance page reflects that: its "Clock In" button
 * opens a scanner rather than calling the action. A one-tap button here would
 * therefore fail for most people, so clocking *in* routes to /hr/attendance
 * where the scanner is.
 *
 * Clocking out has no such gate, so that much happens in place.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { LogIn, LogOut, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAttendanceStatus, clockOut } from '@/actions/hr.actions';
import type { SessionUser } from '@/types';

interface AttendanceStatus {
  status: string | null;
  clockIn?: Date | string | null;
  clockOut?: Date | string | null;
  isClockedIn: boolean;
}

function timeOf(value: Date | string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const CHIP =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold tabular-nums tracking-tight transition-colors';

export function AttendanceChip() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;

  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [isPending, startTransition] = useTransition();

  // setState lives in the promise callback, not the effect body, so this costs
  // no extra render on mount.
  const load = useCallback(() => {
    getAttendanceStatus()
      .then((result) => setStatus(result as AttendanceStatus))
      .catch(() => {
        // Attendance is secondary furniture here; a failure must not take the
        // whole workspace bar down with it.
      });
  }, []);

  useEffect(() => {
    if (!user || user.roleCode === 'SUPER_ADMIN') return;
    load();
  }, [user, load]);

  // The system administrator does not clock in, and the attendance page hides
  // this card for them too.
  if (!user || user.roleCode === 'SUPER_ADMIN') return null;
  if (!status) return null;

  // Day finished: nothing to act on, just a quiet confirmation.
  if (status.clockOut) {
    return (
      <Link
        href="/hr/attendance"
        className={`${CHIP} text-muted-foreground hover:bg-foreground/5 hover:text-foreground`}
        title={`Clocked out at ${timeOf(status.clockOut)}`}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Done</span>
      </Link>
    );
  }

  if (status.isClockedIn) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await clockOut();
            if (result.success) {
              toast.success(result.message ?? 'Clocked out');
              load();
            } else {
              toast.error(result.error ?? 'Could not clock out');
            }
          })
        }
        className={`${CHIP} text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50`}
        title={`Clocked in at ${timeOf(status.clockIn)} — clock out`}
        aria-label={`Clocked in at ${timeOf(status.clockIn)}. Clock out.`}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="hidden sm:inline">{timeOf(status.clockIn)}</span>
      </button>
    );
  }

  return (
    <Link
      href="/hr/attendance"
      className={`${CHIP} text-muted-foreground hover:bg-foreground/5 hover:text-foreground`}
      title="Not clocked in — open attendance to scan the office code"
    >
      <LogIn className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">Clock in</span>
    </Link>
  );
}
