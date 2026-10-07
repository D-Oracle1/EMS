import { ChevronDown, Contact, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { getCustomerApplications } from '@/actions/application.actions';

type Applications = Awaited<ReturnType<typeof getCustomerApplications>>;

/**
 * The application forms this customer filled from a link. They hold what the
 * profile has no place for: religion, L.G.A., bank account, passport photo.
 */
export function CustomerApplications({ applications }: { applications: Applications }) {
  if (!applications.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Contact className="h-5 w-5" />Application forms
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {applications.map((a) => (
          <details key={a.id} className="group rounded-xl border">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="min-w-0">
                <span className="font-medium">{a.formTitle}</span>
                <span className="block text-xs text-muted-foreground">
                  {a.reference && <span className="font-mono">{a.reference}</span>} · submitted {formatDateTime(a.submittedAt)}
                  {a.reviewedBy ? ` · approved by ${a.reviewedBy}` : ''}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 border-t px-4 py-3 text-sm sm:grid-cols-2">
              {a.answers.map((x, i) => (
                <div key={`${x.label}-${i}`} className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">{x.label}</dt>
                  <dd className="break-words">
                    {x.files.length
                      ? x.files.map((f) =>
                          f.type.startsWith('image/') ? (
                            <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="mr-2 inline-block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={f.url} alt={f.name} className="h-20 w-20 rounded-md border object-cover" />
                            </a>
                          ) : (
                            <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="mr-3 inline-flex items-center gap-1 text-indigo-700 hover:underline dark:text-indigo-300">
                              <FileText className="h-3.5 w-3.5" />{f.name}
                            </a>
                          )
                        )
                      : /^\d{4}-\d{2}-\d{2}$/.test(x.text) ? formatDate(x.text) : x.text}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
