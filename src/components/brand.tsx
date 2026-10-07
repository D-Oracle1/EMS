/**
 * The Hylink logo, as the marketing homepage (www.hylinkfinance.com) has it.
 *
 * The files in public/brand are copies of the homepage's own assets:
 *   mark.png        the "H" mark (the homepage's favicon)
 *   logo.png        the colour wordmark, for light backgrounds
 *   logo-white.png  the white wordmark, for dark backgrounds
 * The favicon, app icons and launch screens (src/app/icon.png, apple-icon.png,
 * favicon.ico, public/icons, public/splash) are generated from the same files.
 * On a rebrand, replace these and regenerate the icons.
 *
 * Plain <img>: the files are small, local and already sized, so next/image's
 * optimiser would add a round-trip for nothing.
 */
import { cn } from '@/lib/utils';

export const BRAND_NAME = 'HY-LINK Finance Limited';

/** The square mark alone. */
export function BrandMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark.png" alt={BRAND_NAME} width={186} height={182} className={cn('h-8 w-8 object-contain', className)} />;
}

/** The full wordmark. `tone="light"` is the white version, for dark backgrounds. */
export function BrandLogo({ tone = 'color', className }: { tone?: 'color' | 'light'; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === 'light' ? '/brand/logo-white.png' : '/brand/logo.png'}
      alt={BRAND_NAME}
      width={tone === 'light' ? 898 : 869}
      height={tone === 'light' ? 246 : 182}
      className={cn('h-auto w-36 object-contain', className)}
    />
  );
}

/**
 * The mark on a white tile, so its navy and orange keep their contrast on the
 * dark sidebar and coloured headers.
 */
export function BrandTile({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5', className)}>
      <BrandMark className="h-full w-full" />
    </span>
  );
}
