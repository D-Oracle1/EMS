import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';
import { ThemeProvider, themeScript } from '@/components/theme';

/**
 * `subsets` here controls which faces get preloaded, not which exist:
 * next/font emits @font-face rules for every subset Google publishes, and the
 * browser fetches a given unicode-range file only when a character in it is
 * actually rendered. Naming latin-ext promotes it to a preload rather than a
 * lazy, mid-render discovery, and the named fallbacks cover the gap before it
 * lands.
 *
 * (Currency no longer depends on any of this: money is formatted as "NGN"
 * rather than ₦, because the naira sign is missing from enough device fonts
 * that it was rendering as a struck-through N. See formatCurrency in
 * src/lib/utils.ts.)
 */
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  // Named fallbacks that carry ₦ themselves, so the symbol still reads
  // correctly in the moment before the webfont lands, or if it never does.
  fallback: ['Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
});

/**
 * iOS launch screens: the homepage's wordmark centred on white, one per
 * current iPhone/iPad size (generated from public/brand; see components/brand).
 * The favicon and home-screen icons come from src/app/icon.png, apple-icon.png
 * and favicon.ico, which Next.js links automatically.
 */
const STARTUP_IMAGES = [
  { url: '/splash/splash-750x1334.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
  { url: '/splash/splash-828x1792.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
  { url: '/splash/splash-1125x2436.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
  { url: '/splash/splash-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
  { url: '/splash/splash-1179x2556.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
  { url: '/splash/splash-1242x2688.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
  { url: '/splash/splash-1284x2778.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
  { url: '/splash/splash-1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
  { url: '/splash/splash-1536x2048.png', media: '(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
  { url: '/splash/splash-1668x2388.png', media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
  { url: '/splash/splash-2048x2732.png', media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
];

export const metadata: Metadata = {
  title: 'HY-LINK Finance EMS',
  description: 'Enterprise Management System - HY-LINK Finance Limited',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HY-LINK EMS',
    startupImage: STARTUP_IMAGES,
  },
};

export const viewport: Viewport = {
  // The homepage logo's navy.
  themeColor: '#002078',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint, so the page never
            flashes light and then snaps to dark. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          {children}
          <Toaster position="top-right" richColors theme="system" />
        </ThemeProvider>
      </body>
    </html>
  );
}
