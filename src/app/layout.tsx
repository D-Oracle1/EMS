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

export const metadata: Metadata = {
  title: 'Hylink Finance EMS',
  description: 'Enterprise Management System - Hylink Finance Limited',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Hylink EMS',
  },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
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
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
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
