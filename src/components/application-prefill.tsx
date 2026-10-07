'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Contact } from 'lucide-react';
import { getApplicationPrefill, type ApplicationPrefill } from '@/actions/application.actions';

/**
 * The approved application a new-account screen was opened from
 * (?application=<id>, set by Applications on approval), or null. Read from
 * the address once on mount: these screens are client pages, and reading it
 * this way needs no Suspense boundary around them.
 */
export function useApplicationPrefill(onLoad: (prefill: ApplicationPrefill) => void): ApplicationPrefill | null {
  const [prefill, setPrefill] = useState<ApplicationPrefill | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('application');
    if (!id) return;
    let live = true;
    getApplicationPrefill(id)
      .then((p) => {
        if (!live || !p) return;
        setPrefill(p);
        onLoad(p);
      })
      .catch(() => {});
    return () => { live = false; };
    // Once, on arrival: the officer's own edits must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return prefill;
}

/** Says where the filled-in details came from, and anything the officer should still check. */
export function ApplicationPrefillBanner({ prefill, notes }: { prefill: ApplicationPrefill | null; notes?: (string | null | false | undefined)[] }) {
  if (!prefill) return null;
  const shown = (notes ?? []).filter(Boolean) as string[];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
      <Contact className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
      <div className="min-w-0 space-y-1">
        <p>
          Filled in from application <span className="font-mono font-semibold">{prefill.reference}</span> by{' '}
          <Link href={`/customers/${prefill.customer.id}`} className="font-medium underline">
            {prefill.customer.firstName} {prefill.customer.lastName} ({prefill.customer.customerNumber})
          </Link>
          . Check everything before you save.
        </p>
        {shown.map((n) => <p key={n} className="text-xs opacity-90">{n}</p>)}
      </div>
    </div>
  );
}
