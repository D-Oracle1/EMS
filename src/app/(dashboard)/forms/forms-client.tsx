'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ClipboardList, Plus, Search, Link2, Pencil, BarChart3, CopyPlus, Trash2, Play, Square, Inbox, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { formatDateTime } from '@/lib/utils';
import { setFormStatus, deleteForm, duplicateForm, createOnboardingForm, type getForms } from '@/actions/form.actions';
import { Badge } from '@/components/ui/badge';
import type { ActionResult } from '@/types';
import { StatusBadge, AudienceBadge, copyShareLink } from './form-bits';

type FormRow = Awaited<ReturnType<typeof getForms>>[number];

export function FormsClient({ forms }: { forms: FormRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? forms.filter((f) => f.title.toLowerCase().includes(q)) : forms;
  }, [forms, search]);

  const totals = useMemo(
    () => ({
      open: forms.filter((f) => f.accepting).length,
      responses: forms.reduce((t, f) => t + f.responseCount, 0),
    }),
    [forms]
  );

  const run = async <T,>(id: string, action: () => Promise<ActionResult<T>>, after?: (data: T | undefined) => void) => {
    setBusy(id);
    const result = await action();
    setBusy(null);
    if (!result.success) return toast.error(result.error ?? 'Something went wrong');
    toast.success(result.message);
    if (after) after(result.data);
    else router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forms</h1>
          <p className="text-muted-foreground">
            Build a form, share its link with anyone or with staff, and read every response here
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy === 'onboarding'}
            onClick={() => run('onboarding', () => createOnboardingForm(), (d) => d && router.push(`/forms/${d.id}/edit`))}
          >
            <UserPlus className="mr-2 h-4 w-4" />New onboarding form
          </Button>
          <Button asChild>
            <Link href="/forms/new"><Plus className="mr-2 h-4 w-4" />New form</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="Forms" color="teal" icon={ClipboardList} value={forms.length}
          description={`${forms.filter((f) => f.status === 'DRAFT').length} draft`} />
        <StatCard title="Taking responses" color="emerald" icon={Play} value={totals.open} description="Open right now" />
        <StatCard title="Responses" color="indigo" icon={Inbox} value={totals.responses} description="Across all forms" />
      </div>

      {forms.length > 0 && (
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search forms..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 font-medium">{forms.length === 0 ? 'No forms yet' : 'No form matches your search'}</p>
            {forms.length === 0 && (
              <>
                <p className="mt-1 text-sm text-muted-foreground">Collect details from customers, applicants or staff.</p>
                <Button asChild className="mt-4">
                  <Link href="/forms/new"><Plus className="mr-2 h-4 w-4" />Create your first form</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((f) => (
            <Card key={f.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={f.status} accepting={f.accepting} />
                  <AudienceBadge audience={f.audience} />
                  {f.purpose === 'STAFF_ONBOARDING' && (
                    <Badge variant="outline" className="gap-1 border-indigo-300 text-indigo-700 dark:text-indigo-300">
                      <UserPlus className="h-3 w-3" />Staff onboarding
                    </Badge>
                  )}
                </div>
                <Link href={`/forms/${f.id}`} className="group min-w-0">
                  <h2 className="break-words font-semibold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{f.title}</h2>
                </Link>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-muted/60 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Responses</p>
                    <p className="text-lg font-semibold tabular-nums">{f.responseCount.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Questions</p>
                    <p className="text-lg font-semibold tabular-nums">{f.questionCount}</p>
                  </div>
                </div>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  {f.lastResponseAt && <p>Last response {formatDateTime(f.lastResponseAt)}</p>}
                  {f.closesAt && <p>Closes {formatDateTime(f.closesAt)}</p>}
                  <p>By {f.createdBy ?? 'Unknown'}</p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/forms/${f.id}`}><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Responses</Link>
                  </Button>
                  <Button size="sm" variant="secondary" asChild>
                    <Link href={`/forms/${f.id}/edit`}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Link>
                  </Button>
                  {f.status !== 'DRAFT' && (
                    <Button size="sm" variant="secondary" onClick={() => copyShareLink(f.slug)}>
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />Link
                    </Button>
                  )}
                  {f.status === 'OPEN' ? (
                    <Button size="sm" variant="secondary" disabled={busy === f.id}
                      onClick={() => run(f.id, () => setFormStatus(f.id, 'CLOSED'))}>
                      <Square className="mr-1.5 h-3.5 w-3.5" />Close
                    </Button>
                  ) : (
                    <Button size="sm" variant="success" disabled={busy === f.id}
                      onClick={() => run(f.id, () => setFormStatus(f.id, 'OPEN'))}>
                      <Play className="mr-1.5 h-3.5 w-3.5" />{f.status === 'DRAFT' ? 'Open' : 'Reopen'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busy === f.id} title="Duplicate" aria-label="Duplicate"
                    onClick={() => run(f.id, () => duplicateForm(f.id), (d) => d && router.push(`/forms/${d.id}/edit`))}>
                    <CopyPlus className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === f.id} title="Delete" aria-label="Delete"
                    className="hover:text-rose-600"
                    onClick={() => {
                      const extra = f.responseCount ? ` and its ${f.responseCount} response(s)` : '';
                      if (window.confirm(`Delete "${f.title}"${extra}? This cannot be undone.`)) {
                        run(f.id, () => deleteForm(f.id));
                      }
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
