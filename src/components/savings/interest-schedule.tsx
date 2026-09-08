'use client';

/**
 * Month-by-month interest breakdown for a fixed-term savings account.
 *
 * Shown when opening an account and on the account itself, so both the officer
 * and the saver can see exactly what lands at maturity rather than trusting a
 * headline percentage. The schedule comes from `projectSchedule`, which mirrors
 * the interest engine step for step.
 */

import { useState } from 'react';
import { TrendingUp, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { explainProjection, type Projection } from '@/lib/savings-projection';

const METHOD_LABEL: Record<string, string> = {
  MATURITY_ONLY: 'Interest accrues monthly and is paid as a lump sum at maturity',
  MONTHLY_ALLOCATION: 'Interest is credited to the balance each month',
  FLAT: 'Interest accrues monthly and is paid at maturity',
  COMPOUND: 'Interest compounds into the balance each month',
};

interface Props {
  projection: Projection;
  /** Shown above the summary; defaults to a neutral heading. */
  title?: string;
  /** Start collapsed when the schedule is secondary to the page. */
  defaultOpen?: boolean;
}

export function InterestSchedule({ projection, title = 'What this earns', defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const note = explainProjection(projection);

  if (projection.rows.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            {title}
          </p>
          <Badge variant="secondary" className="text-[11px] font-normal">
            {METHOD_LABEL[projection.method] ?? projection.method}
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Figure label="Principal" value={formatCurrency(projection.principal)} />
          <Figure
            label="Total interest"
            value={formatCurrency(projection.totalInterest)}
            tone="emerald"
          />
          <Figure
            label="Paid at maturity"
            value={formatCurrency(projection.maturityValue)}
            tone="emerald"
            emphasis
          />
          <Figure
            label="Effective return"
            value={`${projection.effectiveRate}%`}
            hint={
              projection.headlineRate !== null && projection.headlineRate !== projection.effectiveRate
                ? `headline ${projection.headlineRate}%`
                : undefined
            }
          />
        </div>

        {note && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{note}</span>
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50"
      >
        <span>
          {open ? 'Hide' : 'Show'} the month-by-month breakdown
          <span className="ml-2 font-normal text-muted-foreground">
            ({projection.rows.length} months, {projection.earningMonths} earning)
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Month</TableHead>
                {projection.rows[0].date && <TableHead>Date</TableHead>}
                <TableHead className="text-right">Earning balance</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Interest to date</TableHead>
                <TableHead className="text-right">Account value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projection.rows.map((row) => (
                <TableRow
                  key={row.month}
                  className={row.interest === 0 ? 'text-muted-foreground' : undefined}
                >
                  <TableCell className="font-medium">{row.month}</TableCell>
                  {row.date && <TableCell className="text-sm">{row.date}</TableCell>}
                  <TableCell className="text-right text-sm">
                    {formatCurrency(row.openingEligible)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.interest === 0 ? (
                      <span title="Deposits do not earn in the month they are made">—</span>
                    ) : (
                      <span className="font-medium text-emerald-700">
                        +{formatCurrency(row.interest)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatCurrency(row.cumulativeInterest)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {formatCurrency(row.closingValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'emerald';
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={[
          emphasis ? 'text-lg font-bold' : 'text-base font-semibold',
          tone === 'emerald' ? 'text-emerald-700' : '',
        ].join(' ')}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
