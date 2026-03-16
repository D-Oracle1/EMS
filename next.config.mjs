import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: false,
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
