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
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      ],
    }, {
      // Route responses cannot override an existing next.config header. The
      // callback selects strict-origin only for its confirmation form HTML.
      source: '/:path((?!api/auth/callback$).*)',
      headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
    }, {
      source: '/api/auth/callback',
      headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" }],
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
