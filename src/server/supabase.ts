import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { AuthActor, OrderDto, ProfileDto } from '@/contracts/api';
import type { OrderDraft, PrivateRepository } from './private-services';
import { ApiError } from './errors';
import { defaultDeliverySchema } from '@/contracts/profile';
import { deploymentOrigin } from './deployment-config';

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const businessDays = z.object({ min: z.number().int().nonnegative().nullable(), max: positiveInteger })
  .refine(value => value.min === null || value.min <= value.max);
const delivery = z.object({
  country: z.enum(['BR', 'US', 'ES', 'CN']), region: z.string().min(1),
  postal: z.string().max(160), street: z.string().max(300), number: z.string().max(160), noNumber: z.boolean(),
  complement: z.string().max(160), district: z.string().max(160), city: z.string().max(160), province: z.string().max(160),
  reference: z.string().max(300), instructions: z.string().max(500), regionName: z.string().min(1),
  zone: z.enum(['BR', 'NA', 'EU', 'AS']), resolvedAddress: z.string().min(1), referenceApplied: z.boolean(),
  method: z.enum(['standard', 'express']), priceInCents: money, businessDays,
});
const quoteItem = z.object({
  slug: z.enum(['original', 'citricos', 'tropicais', 'frutas-vermelhas']), name: z.string().min(1),
  quantity: positiveInteger, unitPriceInCents: money, lineTotalInCents: money,
});
const orderDto = z.object({
  id: z.uuid(), number: z.string().min(1), ownerId: z.uuid(), status: z.literal('simulation_completed'),
  createdAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }),
  currency: z.literal('BRL'), quantity: positiveInteger,
  subtotalInCents: money, discountInCents: money, productsTotalInCents: money, shippingInCents: money, totalInCents: money,
  items: z.array(quoteItem).min(1).max(4), delivery,
}).superRefine((order, context) => {
  const subtotal = order.items.reduce((sum, item) => sum + BigInt(item.lineTotalInCents), 0n);
  const quantity = order.items.reduce((sum, item) => sum + BigInt(item.quantity), 0n);
  const discount = quantity >= 6n ? (subtotal + 5n) / 10n : 0n;
  if (order.items.some(item => BigInt(item.quantity) * BigInt(item.unitPriceInCents) !== BigInt(item.lineTotalInCents))
    || subtotal !== BigInt(order.subtotalInCents) || quantity !== BigInt(order.quantity)
    || discount !== BigInt(order.discountInCents)
    || subtotal - discount !== BigInt(order.productsTotalInCents)
    || BigInt(order.productsTotalInCents) + BigInt(order.shippingInCents) !== BigInt(order.totalInCents)
    || order.shippingInCents !== order.delivery.priceInCents
    || new Set(order.items.map(item => item.slug)).size !== order.items.length
    || Date.parse(order.expiresAt) - Date.parse(order.createdAt) !== 24 * 60 * 60 * 1000) {
    context.addIssue({ code: 'custom', message: 'Invalid persisted order.' });
  }
});
const databaseItem = z.object({
  slug: quoteItem.shape.slug, name: quoteItem.shape.name, quantity: positiveInteger,
  unit_price_in_cents: money, line_total_in_cents: money,
});
const databaseOrder = z.object({
  id: z.uuid(), number: z.string().min(1), user_id: z.uuid(), status: z.literal('simulation_completed'),
  currency: z.literal('BRL'), quantity: positiveInteger, subtotal_in_cents: money, discount_in_cents: money,
  products_total_in_cents: money, shipping_in_cents: money, total_in_cents: money, delivery,
  created_at: z.iso.datetime({ offset: true }), expires_at: z.iso.datetime({ offset: true }),
  items: z.array(databaseItem).min(1).max(4),
});
// A broken optional preference must not prevent the verified owner opening their account.
const profileRow = z.object({ id: z.uuid(), name: z.string().min(1).max(120), default_delivery: defaultDeliverySchema.nullable().optional().catch(null) });
const orderColumns = 'id,number,user_id,status,currency,quantity,subtotal_in_cents,discount_in_cents,products_total_in_cents,shipping_in_cents,total_in_cents,delivery,created_at,expires_at,items:order_items(slug,name,quantity,unit_price_in_cents,line_total_in_cents)';

const unavailable = () => new ApiError(503, 'SERVICE_UNAVAILABLE', 'O serviço de conta e pedidos ainda não está disponível.');

/** Neither server credentials nor raw infrastructure errors are returned to callers. */
function databaseError(error: { code?: string; message?: string; status?: number }): ApiError {
  if (error.code === 'TF001' || error.message === 'ORDER_LIMIT_REACHED') return new ApiError(409, 'ORDER_LIMIT_REACHED', 'Você atingiu o limite de cinco pedidos existentes.');
  if (error.code === 'TF002' || error.message === 'QUOTE_CHANGED') return new ApiError(409, 'QUOTE_CHANGED', 'A revisão mudou. Confira novamente antes de concluir.');
  if (error.code === 'TF003' || error.message === 'NOT_FOUND') return new ApiError(404, 'NOT_FOUND', 'Recurso não encontrado.');
  if (error.code === 'TF004' || error.message === 'PRODUCT_UNAVAILABLE') return new ApiError(409, 'PRODUCT_UNAVAILABLE', 'Um produto não está disponível para esta compra.');
  if (error.code === 'PGRST301' || error.code === 'PGRST302' || error.status === 401) return new ApiError(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
  return unavailable();
}

function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw unavailable();
  return result.data;
}

function mapOrder(value: unknown): OrderDto {
  const row = checked(databaseOrder, value);
  return checked(orderDto, {
    id: row.id, number: row.number, ownerId: row.user_id, status: row.status, currency: row.currency,
    createdAt: row.created_at, expiresAt: row.expires_at, quantity: row.quantity,
    subtotalInCents: row.subtotal_in_cents, discountInCents: row.discount_in_cents,
    productsTotalInCents: row.products_total_in_cents, shippingInCents: row.shipping_in_cents, totalInCents: row.total_in_cents,
    delivery: row.delivery, items: row.items.map(item => ({
      slug: item.slug, name: item.name, quantity: item.quantity,
      unitPriceInCents: item.unit_price_in_cents, lineTotalInCents: item.line_total_in_cents,
    })),
  });
}

async function fetchNoStore(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const parent = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = parent ? AbortSignal.any([parent, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const apiKey = headers.get('apikey');
  // Modern API keys are not JWTs. Some SDK services still add the key as a Bearer fallback.
  if (apiKey && /^sb_(?:secret|publishable)_/.test(apiKey) && headers.get('authorization') === `Bearer ${apiKey}`) headers.delete('authorization');
  return fetch(input, { ...init, headers, cache: 'no-store', signal });
}

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.length > 4096 || /\s/.test(key)) throw unavailable();
  try {
    const destination = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname);
    if ((destination.protocol !== 'https:' && !(local && destination.protocol === 'http:'))
      || destination.username || destination.password || destination.search || destination.hash) throw unavailable();
  } catch { throw unavailable(); }
  return { url, key };
}

type VerifiedContext = { actor: AuthActor; client: SupabaseClient };
const requestContexts = new WeakMap<Request, Promise<VerifiedContext>>();

function hasSessionCookie(request: Request): boolean {
  return /(?:^|;\s*)sb-[^=;\s]+-auth-token(?:\.\d+)?=/.test(request.headers.get('cookie') ?? '');
}

async function verifyRequest(request: Request): Promise<VerifiedContext> {
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if ((authorization && !bearer) || (!bearer && !hasSessionCookie(request))) throw new ApiError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.');
  const { url, key } = publicConfig();
  try {
    let client: SupabaseClient;
    if (bearer) {
      client = createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${bearer}` }, fetch: fetchNoStore },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    } else {
      const cookieStore = await cookies();
      client = createServerClient(url, key, {
        // API-triggered refreshes must preserve the same cookie transport policy
        // as the browser and auth callback, including HTTPS-only production sessions.
        cookieOptions: { path: '/', sameSite: 'lax', secure: new URL(deploymentOrigin(process.env, new URL(request.url).origin)).protocol === 'https:' },
        global: { fetch: fetchNoStore },
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: cookiesToSet => { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      });
    }
    const { data, error } = bearer ? await client.auth.getUser(bearer) : await client.auth.getUser();
    if (error) {
      if (!error.status || error.status >= 500) throw unavailable();
      if (error.status === 429) throw new ApiError(429, 'RATE_LIMITED', 'Tente novamente mais tarde.');
      throw new ApiError(401, 'SESSION_EXPIRED', 'Sua sessão expirou ou não é válida. Entre novamente.');
    }
    const user = data.user;
    if (!user || !z.uuid().safeParse(user.id).success || !user.email || !user.email_confirmed_at) throw new ApiError(401, 'AUTH_REQUIRED', 'Confirme seu e-mail e entre na sua conta para continuar.');
    return { actor: { id: user.id, email: user.email }, client };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}

function verifiedContext(request: Request): Promise<VerifiedContext> {
  let result = requestContexts.get(request);
  if (!result) { result = verifyRequest(request); requestContexts.set(request, result); }
  return result;
}

export async function authenticateRequest(request: Request): Promise<AuthActor> {
  return (await verifiedContext(request)).actor;
}

export async function createPrivateRepository(request: Request, actor: AuthActor): Promise<PrivateRepository> {
  const context = await verifiedContext(request);
  if (context.actor.id !== actor.id) throw new ApiError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.');
  const client = context.client;
  let admin: SupabaseClient | undefined;
  const administration = () => {
    if (admin) return admin;
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret || secret.length > 4096 || /\s/.test(secret)) throw unavailable();
    admin = createClient(publicConfig().url, secret, {
      global: { fetch: fetchNoStore }, db: { retry: false }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return admin;
  };
  const scope = (requested: AuthActor) => {
    if (requested.id !== context.actor.id) throw new ApiError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.');
  };
  const profile = (data: unknown): ProfileDto | null => {
    if (data === null) return null;
    const row = checked(profileRow, data);
    return { id: row.id, name: row.name, email: context.actor.email, defaultDelivery: row.default_delivery ?? null };
  };

  return {
    async getProfile(requested) {
      scope(requested);
      const { data, error } = await client.from('profiles').select('id,name,default_delivery').eq('id', actor.id).maybeSingle();
      if (error) throw databaseError(error);
      return profile(data);
    },
    async updateProfile(requested, name, defaultDelivery) {
      scope(requested);
      const patch = defaultDelivery === undefined ? { name } : { name, default_delivery: defaultDelivery };
      const { data, error } = await client.from('profiles').update(patch).eq('id', actor.id).select('id,name,default_delivery').maybeSingle();
      if (error) throw databaseError(error);
      return profile(data);
    },
    async listOrders(requested, query) {
      scope(requested);
      let selection = client.from('orders').select(orderColumns).eq('user_id', actor.id).gt('expires_at', query.now);
      if (query.cursor) selection = selection.or(`created_at.lt.${query.cursor.createdAt},and(created_at.eq.${query.cursor.createdAt},id.lt.${query.cursor.id})`);
      const { data, error } = await selection.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(query.limit);
      if (error) throw databaseError(error);
      if (!Array.isArray(data)) throw unavailable();
      return data.map(mapOrder);
    },
    async getOrder(requested, id, now) {
      scope(requested);
      const { data, error } = await client.from('orders').select(orderColumns).eq('user_id', actor.id).eq('id', id).gt('expires_at', now).maybeSingle();
      if (error) throw databaseError(error);
      return data === null ? null : mapOrder(data);
    },
    async createOrder(requested, order: OrderDraft) {
      scope(requested);
      // These RPCs must be executable only by the server secret role. Database setup is a separate step.
      const { data, error } = await administration().rpc('tf_create_order', { p_user_id: actor.id, p_order: order }).retry(false);
      if (error) throw databaseError(error);
      return checked(orderDto, data);
    },
    async deleteOrder(requested, id) {
      scope(requested);
      const { data, error } = await administration().rpc('tf_delete_order', { p_user_id: actor.id, p_order_id: id }).retry(false);
      if (error) throw databaseError(error);
      return checked(z.object({ deleted: z.boolean() }), data).deleted;
    },
  };
}
