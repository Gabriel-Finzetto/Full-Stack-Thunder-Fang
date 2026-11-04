import { z } from 'zod';
import type { CreateOrderInput, OrderDto, OrderPage } from '@/contracts/api';
import type { Locale } from '@/i18n/config';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const days = z.object({ min: integer.nullable(), max: positive }).refine(value => value.min === null || value.min <= value.max);
const item = z.object({ slug: z.enum(['original','citricos','tropicais','frutas-vermelhas']), name: z.string().min(1).max(120), quantity: positive, unitPriceInCents: positive, lineTotalInCents: positive });
const delivery = z.object({
  country: z.enum(['BR','US','ES','CN']), region: z.string().min(1).max(80), postal: z.string().max(160),
  street: z.string().max(300), number: z.string().max(160), noNumber: z.boolean(), complement: z.string().max(160),
  district: z.string().max(160), city: z.string().max(160), province: z.string().max(160), reference: z.string().max(300), instructions: z.string().max(500),
  regionName: z.string().min(1).max(200), zone: z.enum(['BR','NA','EU','AS']), resolvedAddress: z.string().min(1).max(300), referenceApplied: z.boolean(),
  method: z.enum(['standard','express']), priceInCents: integer, businessDays: days,
});
const schema = z.object({
  id: z.uuid(), number: z.string().min(1).max(100), ownerId: z.uuid(), status: z.literal('simulation_completed'), currency: z.literal('BRL'),
  createdAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }), quantity: positive,
  subtotalInCents: positive, discountInCents: integer, productsTotalInCents: positive, shippingInCents: integer, totalInCents: positive,
  items: z.array(item).min(1).max(4), delivery,
}).superRefine((order, context) => {
  const subtotal = order.items.reduce((total, line) => total + BigInt(line.lineTotalInCents), 0n);
  const quantity = order.items.reduce((total, line) => total + BigInt(line.quantity), 0n);
  const discount = quantity >= 6n ? (subtotal + 5n) / 10n : 0n;
  if (order.items.some(line => BigInt(line.quantity) * BigInt(line.unitPriceInCents) !== BigInt(line.lineTotalInCents))
    || new Set(order.items.map(line => line.slug)).size !== order.items.length
    || quantity !== BigInt(order.quantity) || subtotal !== BigInt(order.subtotalInCents)
    || discount !== BigInt(order.discountInCents) || subtotal - discount !== BigInt(order.productsTotalInCents)
    || BigInt(order.productsTotalInCents) + BigInt(order.shippingInCents) !== BigInt(order.totalInCents)
    || order.delivery.priceInCents !== order.shippingInCents
    || Date.parse(order.expiresAt) - Date.parse(order.createdAt) !== 86_400_000) {
    context.addIssue({ code: 'custom', message: 'Invalid order data.' });
  }
});

const messages: Record<string,string> = {
  AUTH_REQUIRED: 'Entre na sua conta para continuar.', SESSION_EXPIRED: 'Sua sessão expirou. Entre novamente para continuar.',
  SESSION_CHANGED: 'Sua sessão mudou. Confira sua conta antes de continuar.',
  ORDER_LIMIT_REACHED: 'Você atingiu o limite de cinco pedidos. Exclua um pedido existente para liberar uma vaga.',
  QUOTE_CHANGED: 'A revisão mudou. Recalcule e confira o pedido antes de concluir.', PRODUCT_UNAVAILABLE: 'Um produto não está disponível. Confira seu carrinho.',
  RATE_LIMITED: 'Aguarde antes de tentar novamente.', NOT_FOUND: 'O pedido foi removido, expirou ou não pertence à sua conta.',
  INVALID_INPUT: 'Confira os dados informados.', INVALID_RESPONSE: 'Não foi possível consultar seus pedidos. Tente novamente.',
  ORDER_RESULT_UNKNOWN: 'Não foi possível confirmar o resultado. Consulte seus pedidos antes de enviar novamente.',
};
export class AccountRequestError extends Error {
  constructor(public code: string, public status?: number) { super(messages[code] ?? 'O serviço de pedidos está temporariamente indisponível.'); this.name = 'AccountRequestError'; }
}

/** Full delivery remains in memory only and only for the verified API owner. */
export function readOrder(value: unknown, ownerId: string, now = Date.now()): OrderDto | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data.ownerId !== ownerId) throw new AccountRequestError('INVALID_RESPONSE', 503);
  return Date.parse(parsed.data.expiresAt) > now ? parsed.data : null;
}
export function readOrders(value: unknown, ownerId: string, now = Date.now()): OrderPage {
  const parsed = z.object({ orders: z.array(z.unknown()).max(5), nextCursor: z.string().nullable() }).safeParse(value);
  if (!parsed.success) throw new AccountRequestError('INVALID_RESPONSE', 503);
  const orders = parsed.data.orders.map(order => readOrder(order, ownerId, now)).filter((order): order is OrderDto => order !== null);
  if (new Set(orders.map(order => order.id)).size !== orders.length) throw new AccountRequestError('INVALID_RESPONSE',503);
  return { orders, nextCursor: parsed.data.nextCursor };
}
export async function responseError(response: Response): Promise<AccountRequestError> {
  let code = response.status === 401 ? 'SESSION_EXPIRED' : response.status === 429 ? 'RATE_LIMITED' : response.status === 404 ? 'NOT_FOUND' : 'SERVICE_UNAVAILABLE';
  try { const value: unknown = await response.json(); if (value && typeof value === 'object' && 'code' in value && typeof value.code === 'string' && /^[A-Z_]{1,80}$/.test(value.code)) code = value.code; } catch { /* No raw provider response is shown. */ }
  return new AccountRequestError(code,response.status);
}

/** A purchase is sent once. Network/5xx/invalid-success outcomes are explicitly uncertain. */
export async function sendOrder(input: CreateOrderInput, locale: Locale, ownerId: string, fetcher: typeof fetch = fetch): Promise<OrderDto> {
  let response: Response;
  try {
    response = await fetcher(`/api/orders?locale=${encodeURIComponent(locale)}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-TF-Account': ownerId },
      body: JSON.stringify(input), signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new AccountRequestError('ORDER_RESULT_UNKNOWN'); }
  if (response.status >= 500) throw new AccountRequestError('ORDER_RESULT_UNKNOWN',response.status);
  if (!response.ok) throw await responseError(response);
  try {
    if (response.status !== 201) throw new Error('Unexpected purchase response.');
    const value: unknown = await response.json();
    const order = value && typeof value === 'object' && 'order' in value ? readOrder(value.order, ownerId) : null;
    if (!order) throw new Error('Missing active order.');
    return order;
  } catch { throw new AccountRequestError('ORDER_RESULT_UNKNOWN',response.status); }
}

export function businessDaysText(value: { min: number | null; max: number }, t: (text: string) => string): string {
  return (value.min === null ? t('Até {max} dias úteis') : t('{min} a {max} dias úteis')).replace('{min}',String(value.min)).replace('{max}',String(value.max));
}
