'use client';

/**
 * Who joined and who left in one month, opened from a bar on the hires-and-exits
 * chart.
 *
 * Deliberately its own component rather than a generalisation of the savings
 * month dialog. Both follow the same pattern — click a bar, get the records
 * behind the number, export them — but they answer different questions with
 * different columns, so one shared abstraction would have to be bent out of
 * shape to serve both. The pattern is shared; the implementation is not.
 */

import { useEffect, useState } from 'react';
import { Loader2, FileDown, UserPlus, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getHeadcountMonthDetail,
  type HeadcountMonthDetail,
  type HeadcountMovement,
} from '@/actions/hr-analytics.actions';
import { logExportAction } from '@/actions/report.actions';

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

export function HeadcountMonthDialog({
  month,
  onClose,
}: {
  /** YYYY-MM, or null when the dialog is shut. */
  month: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<HeadcountMonthDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!month) {
      setDetail(null);
      return;
    }
    let stale = false;
    setLoading(true);
    getHeadcountMonthDetail(month)
      .then((result) => {
        if (!stale) setDetail(result);
      })
      .catch((error: unknown) => {
        if (!stale) {
          toast.error(error instanceof Error ? error.message : 'Could not load that month');
          onClose();
        }
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const exportCsv = () => {
    if (!detail) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ...detail.hires.map((p) => ['Hire', p] as const),
      ...detail.exits.map((p) => ['Exit', p] as const),
    ];
    const csv = [
      ['Movement', 'Date', 'Employee ID', 'Name', 'Job title', 'Department', 'Role', 'Type', 'Status']
        .map(esc)
        .join(','),
      ...rows.map(([kind, p]) =>
        [
          kind,
          new Date(p.date).toLocaleDateString('en-NG'),
          p.employeeId,
          p.name,
          p.jobTitle ?? '',
          p.department,
          p.role,
          p.employmentType,
          p.status,
        ]
          .map(esc)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `headcount-${detail.month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    logExportAction('headcount-month', 'CSV').catch(() => {});
    toast.success('CSV exported');
  };

  const list = (people: HeadcountMovement[], empty: string) =>
    people.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
    ) : (
      // Not links: there is no per-staff detail route (/hr/staff is a
      // directory listing, and the only dynamic segments under /hr are payroll
      // and recruitment). A row that looks clickable and lands on an
      // unfiltered list is worse than a row that doesn't pretend.
      <div className="space-y-1">
        {people.map((p) => (
          <div key={p.id} className="flex items-start gap-3 rounded-2xl px-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {p.jobTitle ? `${p.jobTitle} · ` : ''}
                {p.department} · {p.employeeId}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{dayOf(p.date)}</span>
          </div>
        ))}
      </div>
    );

  return (
    <Dialog open={Boolean(month)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail ? detail.label : 'Loading month…'}</DialogTitle>
        </DialogHeader>

        {loading && !detail ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Pulling the month together…
          </p>
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" className="text-xs">
                {detail.hires.length} hired
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {detail.exits.length} left
              </Badge>
              <Badge
                variant={detail.net >= 0 ? 'success' : 'error'}
                className="text-xs"
              >
                net {detail.net > 0 ? `+${detail.net}` : detail.net}
              </Badge>
              <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv}>
                <FileDown className="mr-1 h-4 w-4" /> CSV
              </Button>
            </div>

            <section className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <UserPlus className="h-4 w-4 text-emerald-600" />
                Joined
              </h3>
              {list(detail.hires, `Nobody joined in ${detail.label}.`)}
            </section>

            <section className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <UserMinus className="h-4 w-4 text-rose-600" />
                Left
              </h3>
              {list(detail.exits, `Nobody left in ${detail.label}.`)}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
