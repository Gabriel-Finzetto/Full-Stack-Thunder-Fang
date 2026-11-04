import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ZodType, output } from 'zod';
import { ApiError } from './errors';
import { parse } from './schemas';
import { enforceRateLimit } from './rate-limit';
import { isLocalBackend } from './config';
import { trustedRequestOrigin } from './deployment-config';

export const MAX_BODY_BYTES = 32 * 1024;
function guardWrite(request: Request) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (request.method !== 'DELETE' && type !== 'application/json' || request.method === 'DELETE' && type !== undefined && type !== 'application/json') throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie os dados como JSON.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'FORBIDDEN', 'Origem não permitida.');
  const origin = request.headers.get('origin');
  let expected: string | null;
  try { expected = trustedRequestOrigin(request, isLocalBackend(), new URL(request.url).origin); } catch { throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'A origem da aplicação não está configurada.'); }
  if (!expected) throw new ApiError(403, 'FORBIDDEN', 'Origem não permitida.');
  if (origin && origin !== expected) throw new ApiError(403, 'FORBIDDEN', 'Origem não permitida.');
  if (request.headers.has('cookie') && !origin && request.headers.get('sec-fetch-site') !== 'same-origin') throw new ApiError(403, 'FORBIDDEN', 'Confirme a origem da solicitação.');
}
export async function readJson<T extends ZodType>(request: Request, schema: T): Promise<output<T>> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'A solicitação excede o tamanho permitido.');
  if (!request.body) throw new ApiError(400, 'INVALID_INPUT', 'Informe um corpo JSON.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'A solicitação excede o tamanho permitido.'); } chunks.push(value); }
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'INVALID_INPUT', 'Não foi possível ler a solicitação.'); }
  let data: unknown;
  try { const body = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; } data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
  catch { throw new ApiError(400, 'INVALID_INPUT', 'O JSON informado é inválido.'); }
  return parse(schema, data);
}
type RouteOptions = { mutation?: boolean; rate?: 'quote' | 'contact' };
export function apiRoute<Context = unknown>(handler: (request: Request, context: Context) => Response | Promise<Response>, options: RouteOptions = {}) {
  return async (request: Request, context: Context): Promise<Response> => {
    const requestId = randomUUID(); let response: Response;
    try {
      if (options.mutation) guardWrite(request);
      if (options.rate) await enforceRateLimit(request, options.rate);
      response = await handler(request, context);
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError(500, 'INTERNAL_ERROR', 'Não foi possível concluir a solicitação.');
      if (!(error instanceof ApiError)) console.error('Thunder Fang backend error', { requestId, code: failure.code });
      response = Response.json({ code: failure.code, message: failure.message, ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}) }, { status: failure.status });
      if (failure.retryAfter !== undefined) response.headers.set('Retry-After', String(failure.retryAfter));
    }
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Pragma', 'no-cache'); response.headers.set('Expires', '0');
    response.headers.set('X-Content-Type-Options', 'nosniff'); response.headers.set('X-Request-Id', requestId);
    response.headers.set('Vary', 'Cookie, Authorization');
    return response;
  };
}
