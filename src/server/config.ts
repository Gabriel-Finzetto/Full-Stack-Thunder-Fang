import 'server-only';
import { randomBytes } from 'node:crypto';
import { ApiError } from './errors';

export function isLoopback(hostname: string) { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname); }
export function isLocalBackend() {
  if (process.env.BACKEND_LOCAL_MODE !== 'true' || process.env.VERCEL) return false;
  try { return isLoopback(new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000').hostname); }
  catch { return false; }
}
const localSecretKey = Symbol.for('thunderfang.local-review-secret');
export function reviewSecret(): Buffer {
  const configured = process.env.BACKEND_REVIEW_SECRET;
  if (configured && Buffer.byteLength(configured, 'utf8') >= 32) return Buffer.from(configured, 'utf8');
  if (configured || !isLocalBackend()) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'A validação das revisões ainda não está configurada.');
  const local = globalThis as typeof globalThis & { [localSecretKey]?: Buffer };
  return local[localSecretKey] ??= randomBytes(32);
}
