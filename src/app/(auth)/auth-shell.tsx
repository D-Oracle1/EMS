import Link from 'next/link';

/**
 * The split-screen shell used by sign-in and the account enquiry, matching the
 * marketing site's auth pages so the two halves of the product read as one.
 *
 * The logo and artwork are served from the marketing site rather than copied in,
 * so a rebrand there carries straight through here.
 */

const SITE = 'https://www.hylinkfinance.com';

export interface AuthShellProps {
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
  /** Rendered under the form — the cross-link to the other auth page. */
  footer?: React.ReactNode;
  panel?: {
    eyebrow: string;
    heading: React.ReactNode;
    body: string;
  };
}

const DEFAULT_PANEL = {
  eyebrow: 'Trusted since day one',
  heading: (
    <>
      Your money,
      <br />
      working harder.
    </>
  ),
  body:
    'Savings, fixed deposits, mutual funding and debt financing — managed in one place, ' +
    'backed by people who pick up the phone.',
};

const STATS = [
  { value: '1,000', suffix: '+', label: 'Clients served' },
  { value: '5', suffix: '+', label: 'Years of trust' },
  { value: '₦1B', suffix: '+', label: 'Funds disbursed' },
];

export function AuthShell({ eyebrow, title, lede, children, footer, panel }: AuthShellProps) {
  const art = panel ?? DEFAULT_PANEL;

  return (
    <main className="min-h-screen bg-white text-slate-800 lg:grid lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <a href={SITE} className="mb-10 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${SITE}/assets/logo-brand.png`}
              alt="HY-LINK Finance Limited"
              className="w-36"
            />
          </a>

          <span className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
            {eyebrow}
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">{lede}</p>

          {children}

          {footer}

          <p className="mt-6 text-center text-sm text-slate-500">
            <a href={SITE} className="hover:text-slate-800">
              &larr; Back to site
            </a>
          </p>
        </div>
      </div>

      {/* Art side */}
      <div className="hidden p-5 lg:sticky lg:top-0 lg:block lg:h-screen">
        <div className="relative h-full min-h-[36rem] overflow-hidden rounded-3xl">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${SITE}/Group.jpg')` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#011430] via-[#011430]/70 to-[#011430]/30" />
          <div className="relative flex h-full flex-col justify-end p-12">
            <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white/80">
              {art.eyebrow}
            </span>
            <h2 className="mt-5 text-4xl font-bold leading-tight text-white">{art.heading}</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">{art.body}</p>

            <div className="mt-10 flex items-center gap-8">
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <p className="text-2xl font-bold text-white">
                    {stat.value}
                    <span className="text-orange-500">{stat.suffix}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-white/50">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/** The brand field style used across both auth forms. */
export const FIELD_CLASS =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 ' +
  'placeholder:text-slate-400 transition focus:border-orange-500 focus:outline-none ' +
  'focus:ring-2 focus:ring-orange-500/20 disabled:bg-slate-50';

/** The brand primary button. */
export const BUTTON_CLASS =
  'w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white transition ' +
  'hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export { Link };
