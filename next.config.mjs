import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: false,
  // Precache everything in public/ except splash/: the iOS launch screens are
  // one image per device size, and a device only ever asks for its own, so
  // precaching all of them would cost every user megabytes for one file.
  globPublicPatterns: ['*', 'brand/**', 'icons/**'],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use webpack instead of turbopack — @serwist/next does not support Turbopack
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [],
  },
};

export default withSerwist(nextConfig);
