'use client';
import { createBrowserClient } from '@supabase/ssr';
export { safeReturn, authErrorMessage } from './auth-navigation';
import { emailReturn } from './auth-navigation';
import type { Locale } from '@/i18n/config';

// Each email must select its own verifier. A rejected resend otherwise replaces
// and then removes the legacy verifier still needed by the first email.
export const browserAuthOptions = { experimental: { appendPkceFlowIdToRedirects: true } } as const;

let client: ReturnType<typeof createBrowserClient> | undefined;
export function getAuthClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith('sb_secret_')) throw new Error('AUTH_UNAVAILABLE');
  client = createBrowserClient(url, key, {
    auth: browserAuthOptions,
    cookieOptions: { sameSite: 'lax', path: '/', secure: window.location.protocol === 'https:' },
    global: { fetch: (input, init) => {
      const parent = init?.signal;
      const signal = parent ? AbortSignal.any([parent, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
      return fetch(input, { ...init, signal, cache: 'no-store' });
    } },
  });
  return client;
}

export function authRedirect(locale: Locale, returnTo: string, flow: 'confirm' | 'recovery'): string {
  const callback = new URL('/api/auth/callback', window.location.origin);
  callback.searchParams.set('locale', locale);
  callback.searchParams.set('retorno', emailReturn(returnTo, flow));
  callback.searchParams.set('flow', flow);
  return callback.href;
}
