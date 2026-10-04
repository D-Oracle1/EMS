import Link from 'next/link';
import { CheckCircle2, ChevronRight, ListChecks, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { getMyForms } from '@/actions/form.actions';

/** Staff forms open to everyone, and whether this staff member has answered each. */
export default async function MyFormsPage() {
  const forms = await getMyForms();
  const pending = forms.filter((f) => !f.respondedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Forms</h1>
        <p className="text-muted-foreground">
          {pending.length
            ? `${pending.length} form${pending.length === 1 ? '' : 's'} waiting for your response`
            : 'Forms the company asks staff to fill in appear here'}
        </p>
      </div>

      {forms.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <ListChecks className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 font-medium">Nothing to fill in</p>
            <p className="mt-1 text-sm text-muted-foreground">You are all caught up.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((f) => {
            const done = !!f.respondedAt;
            const locked = done && f.oneResponsePerStaff;
            const body = (
              <Card className={locked ? 'opacity-75' : 'transition-shadow hover:border-indigo-300 hover:shadow-md'}>
                <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                  <span className={`icon-tile icon-tile-sm ${done ? 'icon-tile-emerald' : 'icon-tile-teal'}`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{f.title}</p>
                    {f.description && <p className="line-clamp-2 text-sm text-muted-foreground">{f.description}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{f.questionCount} question{f.questionCount === 1 ? '' : 's'}</span>
                      {f.closesAt && (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Closes {formatDateTime(f.closesAt)}</span>
                      )}
                      {done && <span>Answered {formatDateTime(f.respondedAt!)}</span>}
                    </div>
                  </div>
                  {done ? (
                    <Badge variant="success" className="shrink-0">Done</Badge>
                  ) : (
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                </CardContent>
              </Card>
            );
            return locked ? (
              <div key={f.id}>{body}</div>
            ) : (
              <Link key={f.id} href={`/f/${f.slug}`} className="block">{body}</Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
