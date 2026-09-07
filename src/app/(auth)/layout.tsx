/**
 * The auth pages carry the marketing site's full-bleed split-screen design, so
 * they own their own layout rather than sitting in a centred card.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>;
}
