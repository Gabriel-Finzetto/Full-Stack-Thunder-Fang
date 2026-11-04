import type { NextConfig } from "next";
import { assertHostedDeployment } from './src/server/deployment-config';

assertHostedDeployment();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{
      source: '/:path*',
      // Prevent a signed-in store from being embedded as a clickjacking target.
      // These directives also block plugin documents and injected form destinations.
      headers: [
        { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      ],
    }, {
      source: '/images/can-runtime/:path*',
      headers: [{ key:'Cache-Control', value:'public, max-age=31536000, immutable' }],
    }];
  },
  images: {
    localPatterns: [
      { pathname: '/**', search: '' },
      { pathname: '/images/cans/*.png', search: '?v=anatomical-paws-sides-20261101' },
      { pathname: '/images/products/*.png', search: '?v=anatomical-paws-sides-20261101' },
      { pathname: '/images/can-sides/*.png', search: '?v=anatomical-paws-sides-20261101' },
    ],
  },
};

export default nextConfig;
