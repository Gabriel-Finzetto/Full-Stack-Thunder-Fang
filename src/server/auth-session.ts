import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { reviewSecret, isLocalBackend } from './config';
import { ApiError } from './errors';
import { deploymentOrigin, trustedRequestOrigin } from './deployment-config';

export const recoveryCookie = 'tf-recovery';
export const recoveryLifetime = 600;
const markerSchema = z.strictObject({ v: z.literal(1), user: z.uuid(), session: z.uuid(), expires: z.number().int().positive(), nonce: z.string().regex(/^[a-f0-9]{32}$/) });
const unavailable = () => new ApiError(503, 'SERVICE_UNAVAILABLE', 'O serviço de acesso está temporariamente indisponível.');

export function authOrigin(request: Request): string {
  try {
    const external = trustedRequestOrigin(request, isLocalBackend());
    if (external) return external;
  } catch { /* Configuration failures must not accept a request-controlled host. */ }
  throw unavailable();
}

export async function createAuthServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith('sb_secret_')) throw unavailable();
  const store = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { path: '/', sameSite: 'lax', secure: new URL(deploymentOrigin()).protocol === 'https:' },
    global: { fetch: (input, init) => {
      const parent = init?.signal;
      const signal = parent ? AbortSignal.any([parent, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
      const headers = new Headers(init?.headers);
      if (key.startsWith('sb_publishable_') && headers.get('authorization') === `Bearer ${key}`) headers.delete('authorization');
      return fetch(input, { ...init, headers, signal, cache: 'no-store' });
    } },
    cookies: { getAll: () => store.getAll(), setAll: values => { values.forEach(({ name, value, options }) => store.set(name, value, options)); } },
  });
}

function signature(payload: string): Buffer { return createHmac('sha256', reviewSecret()).update(`thunderfang:recovery:v1:${payload}`).digest(); }
export function createRecoveryMarker(user: string, session: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify(markerSchema.parse({ v: 1, user, session, expires: now + recoveryLifetime * 1000, nonce: randomBytes(16).toString('hex') }))).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
}
export function verifyRecoveryMarker(token: string | undefined, user: string, session: string, now = Date.now()): boolean {
  if (!token || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return false;
  try {
    const [payload, signed] = token.split('.');
    const actual = Buffer.from(signed, 'base64url');
    const expected = signature(payload);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const value = markerSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    return value.user === user && value.session === session && value.expires > now && value.expires <= now + recoveryLifetime * 1000;
  } catch { return false; }
}

export async function recoveryIdentity(client: Awaited<ReturnType<typeof createAuthServerClient>>) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email_confirmed_at) return null;
  const claims = await client.auth.getClaims();
  if (claims.error || claims.data?.claims.sub !== data.user.id || !z.uuid().safeParse(claims.data.claims.session_id).success) return null;
  return { id: data.user.id, session: claims.data.claims.session_id as string };
}
export const recoveryCookieOptions = (origin: string) => ({ httpOnly: true, secure: new URL(origin).protocol === 'https:', sameSite: 'lax' as const, path: '/api/auth', maxAge: recoveryLifetime });
