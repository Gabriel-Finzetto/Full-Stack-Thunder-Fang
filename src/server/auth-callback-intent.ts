import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { Locale } from '@/i18n/config';
import { authOrigin } from './auth-session';

const fields = ['token_hash', 'type', 'locale', 'flow', 'retorno'] as const;
const lifetime = 600;
const maxBodyBytes = 24 * 1024;
const hash = (query: URLSearchParams) => createHash('sha256').update(JSON.stringify(fields.map(field => [field, query.get(field) ?? '']))).digest('hex');
const cookieName = (origin: string) => origin.startsWith('https:') ? '__Host-tf-auth-intent' : 'tf-auth-intent';
const cookieOptions = (origin: string) => ({ path: '/', sameSite: 'lax' as const, httpOnly: true, secure: origin.startsWith('https:'), maxAge: lifetime });
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const copy = {
  'pt-BR': ['Confirme seu acesso', 'Continue somente se você solicitou este e-mail para entrar ou recuperar sua conta.', 'Continuar'],
  en: ['Confirm your access', 'Continue only if you requested this email to sign in or recover your account.', 'Continue'],
  es: ['Confirma tu acceso', 'Continúa solo si solicitaste este correo para entrar o recuperar tu cuenta.', 'Continuar'],
  'zh-Hans': ['确认访问', '仅在你申请了此登录或账户恢复邮件时继续。', '继续'],
} as const;

/** Bearer email links must not silently replace a visitor's session on GET. */
export async function confirmEmailIntent(query: URLSearchParams, origin: string, locale: Locale): Promise<Response> {
  const nonce = randomBytes(32).toString('hex');
  const jar = await cookies();
  jar.set(cookieName(origin), `${nonce}.${hash(query)}`, cookieOptions(origin));
  const [title, description, button] = copy[locale];
  const inputs = fields.map(field => `<input type="hidden" name="${field}" value="${escape(query.get(field) ?? '')}">`).join('');
  const body = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Thunder Fang</title></head><body><main><p>Thunder Fang Energy</p><h1>${title}</h1><p>${description}</p><form action="/api/auth/callback" method="post">${inputs}<input type="hidden" name="intent" value="${nonce}"><button type="submit">${button}</button></form></main></body></html>`;
  return new Response(body, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    // no-referrer makes a browser form POST send Origin:null. Preserve the
    // origin check while withholding the token-bearing path and query.
    'Referrer-Policy': 'strict-origin',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  } });
}

/** Validate the same-origin form, its nonce and the exact email link before SDK writes. */
export async function readEmailIntent(request: Request): Promise<URLSearchParams | null> {
  const origin = authOrigin(request);
  if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site'
    || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodyBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const form = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if ([...form.keys()].some(field => ![...fields, 'intent'].includes(field))
    || [...fields, 'intent'].some(field => form.getAll(field).length !== 1)) return null;
  const nonce = form.get('intent');
  if (!nonce || !/^[a-f0-9]{64}$/.test(nonce)) return null;
  const jar = await cookies();
  const actual = jar.get(cookieName(origin))?.value;
  const expected = `${nonce}.${hash(form)}`;
  if (!actual || actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return null;
  jar.set(cookieName(origin), '', { ...cookieOptions(origin), maxAge: 0 });
  form.delete('intent');
  return form;
}
