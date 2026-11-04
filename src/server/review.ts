import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors';
import { reviewSecret } from './config';

export const REVIEW_LIFETIME_MS = 10 * 60 * 1000;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Non-serializable review payload');
  return serialized;
}
function signature(payload: unknown, expires: number) {
  return createHmac('sha256', reviewSecret()).update(`tf-review-v1.${expires}.${canonical(payload)}`).digest();
}
export function signReview(payload: unknown): { reviewToken: string; reviewExpiresAt: string } {
  const expires = Date.now() + REVIEW_LIFETIME_MS;
  const token = { v: 1, exp: expires, sig: signature(payload, expires).toString('base64url') };
  return { reviewToken: Buffer.from(JSON.stringify(token)).toString('base64url'), reviewExpiresAt: new Date(expires).toISOString() };
}
export function verifyReview(token: string, payload: unknown): void {
  const invalid = () => new ApiError(409, 'QUOTE_CHANGED', 'Confira novamente os valores e a entrega antes de confirmar.');
  if (!token || token.length > 2048 || !/^[\w-]+$/.test(token)) throw invalid();
  let parsed: { v: unknown; exp: unknown; sig: unknown };
  try { parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')); } catch { throw invalid(); }
  if (!parsed || parsed.v !== 1 || !Number.isSafeInteger(parsed.exp) || typeof parsed.exp !== 'number' || parsed.exp <= Date.now() || parsed.exp > Date.now() + REVIEW_LIFETIME_MS || typeof parsed.sig !== 'string' || !/^[\w-]{43}$/.test(parsed.sig)) throw invalid();
  const supplied = Buffer.from(parsed.sig, 'base64url');
  const expected = signature(payload, parsed.exp);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw invalid();
}
