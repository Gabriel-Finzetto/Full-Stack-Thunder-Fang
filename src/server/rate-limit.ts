import 'server-only';
import { createHmac } from 'node:crypto';
import { isLocalBackend } from './config';
import { ApiError } from './errors';

type Scope = 'quote' | 'private' | 'contact';
const policies: Record<Scope, { limit: number; windowSeconds: number }> = {
  quote: { limit: 120, windowSeconds: 60 },
  private: { limit: 120, windowSeconds: 60 },
  contact: { limit: 5, windowSeconds: 60 },
};
const loopback = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const unavailable = () => new ApiError(503, 'SERVICE_UNAVAILABLE', 'A proteção do serviço está temporariamente indisponível.');

/** Global portfolio quotas are shared by the database, not individual server instances. */
export async function enforceRateLimit(request: Request, scope: Scope): Promise<void> {
  if (isLocalBackend() && loopback.has(new URL(request.url).hostname)) return;
  const policy = policies[scope];
  const secret = process.env.BACKEND_REVIEW_SECRET;
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!policy || !secret || Buffer.byteLength(secret, 'utf8') < 32 || !key || key.startsWith('sb_publishable_') || /[\r\n\0]/.test(key) || !rawUrl) throw unavailable();
  let base: URL;
  try { base = new URL(rawUrl); } catch { throw unavailable(); }
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback.has(base.hostname))) || base.username || base.password || base.search || base.hash) throw unavailable();
  const headers: Record<string, string> = { apikey: key, accept: 'application/json', 'content-type': 'application/json' };
  // Modern secret keys belong in apikey; legacy service-role JWTs also authenticate through Authorization.
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const bucket = createHmac('sha256', secret).update(`thunderfang:rate:v1:${scope}`).digest('hex');
  try {
    const response = await fetch(new URL('/rest/v1/rpc/tf_rate_limit', base), {
      method: 'POST', headers, body: JSON.stringify({ p_key: bucket, p_limit: policy.limit, p_window_seconds: policy.windowSeconds }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw unavailable();
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('allowed' in result) || typeof result.allowed !== 'boolean'
      || !('retryAfter' in result) || !Number.isSafeInteger(result.retryAfter) || (result.retryAfter as number) < 0 || (result.retryAfter as number) > 86_400) throw unavailable();
    if (!result.allowed) throw new ApiError(429, 'RATE_LIMITED', 'Muitas solicitações. Aguarde antes de tentar novamente.', undefined, Math.max(1, result.retryAfter as number));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}
