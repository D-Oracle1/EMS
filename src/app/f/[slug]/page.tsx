import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock, CalendarX2, FileQuestion, CheckCircle2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand';
import { getPublicForm } from '@/actions/form.actions';
import { PublicForm } from './public-form';

/**
 * A form's share link. Outside the dashboard on purpose: whoever opens it —
 * a customer, a job applicant, a member of staff — sees only the form.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const form = await getPublicForm(slug);
  const title = form.state === 'not-found' ? 'Form not found' : form.state === 'open' ? form.form.title : form.title;
  return { title: `${title} · Hy-Link Finance`, robots: { index: false, follow: false } };
}

export default async function FormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await getPublicForm(slug);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-background to-background px-4 pb-16 pt-[calc(1.5rem+env(safe-area-inset-top))] dark:from-indigo-950/40">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex justify-center">
          <BrandLogo className="w-36" />
        </div>

        {form.state === 'open' ? (
          <PublicForm slug={slug} form={form.form} preview={form.preview} respondent={form.respondent} />
        ) : (
          <div className="rounded-3xl border bg-card p-8 text-center shadow-sm">
            {form.state === 'not-found' && (
              <Notice icon={FileQuestion} title="Form not found" body="This link may be mistyped, or the form has been removed." />
            )}
            {form.state === 'closed' && (
              <Notice icon={CalendarX2} title={form.title} body="This form is no longer taking responses." />
            )}
            {form.state === 'answered' && (
              <Notice icon={CheckCircle2} title={form.title} body={form.message} />
            )}
            {form.state === 'login' && (
              <>
                <Notice icon={Lock} title={form.title} body="This form is for Hy-Link Finance staff. Sign in with your staff account to respond." />
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(`/f/${slug}`)}`}
                  className="mt-5 inline-flex h-10 items-center rounded-md bg-gradient-to-r from-indigo-600 to-blue-600 px-5 text-sm font-medium text-white shadow-sm"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Notice({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <>
      <Icon className="mx-auto h-10 w-10 text-indigo-500" />
      <h1 className="mt-3 text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </>
  );
}
