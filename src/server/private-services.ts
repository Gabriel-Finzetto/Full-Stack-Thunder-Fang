import 'server-only';
import { z } from 'zod';
import type { AuthActor, CheckoutQuoteDto, CreateOrderInput, DefaultDelivery, OrderDto, OrderPage, ProfileDto } from '@/contracts/api';
import { defaultDeliverySchema } from '@/contracts/profile';
import type { Locale } from '@/i18n/config';
import { ApiError } from './errors';
import { assertCurrentCheckoutReview as assertCheckoutReview } from './quotes';

export type OrderDraft = Omit<CheckoutQuoteDto, 'reviewToken' | 'reviewExpiresAt'>;
export type OrderCursor = { createdAt: string; id: string };
export type OrderListQuery = { limit?: number; cursor?: string | null };
export type RepositoryOrderQuery = { limit: number; cursor: OrderCursor | null; now: string };

/** Production implementations must scope every query to the supplied verified actor. */
export interface PrivateRepository {
  getProfile(actor: AuthActor): Promise<ProfileDto | null>;
  updateProfile(actor: AuthActor, name: string, defaultDelivery?: DefaultDelivery | null): Promise<ProfileDto | null>;
  listOrders(actor: AuthActor, query: RepositoryOrderQuery): Promise<OrderDto[]>;
  getOrder(actor: AuthActor, id: string, now: string): Promise<OrderDto | null>;
  createOrder(actor: AuthActor, order: OrderDraft): Promise<OrderDto>;
  deleteOrder(actor: AuthActor, id: string): Promise<boolean>;
}

const cursorSchema = z.strictObject({ v: z.literal(1), createdAt: z.iso.datetime({ offset: true }), id: z.uuid() });
const profileName = z.string().trim().min(1).max(120);
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Recurso não encontrado.');
const invalidCursor = () => new ApiError(400, 'INVALID_INPUT', 'Paginação inválida.', { cursor: ['Use o cursor retornado pela consulta anterior.'] });

function decodeCursor(value?: string | null): OrderCursor | null {
  if (!value) return null;
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalidCursor();
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch { throw invalidCursor(); }
}

function encodeCursor(order: OrderDto): string {
  return Buffer.from(JSON.stringify({ v: 1, createdAt: order.createdAt, id: order.id })).toString('base64url');
}

function activeOwnedOrder(order: OrderDto, actor: AuthActor, now: number): boolean {
  return order.ownerId === actor.id && Date.parse(order.expiresAt) > now;
}

/** Pure orchestration with injected persistence; test repositories never become application data. */
export function createPrivateServices(actor: AuthActor, repository: PrivateRepository, options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  if (!z.uuid().safeParse(actor.id).success || !actor.email) throw new ApiError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.');
  const assertExpectedOwner = (expectedOwnerId?: string) => {
    // A session can change between rendering a form and sending its mutation.
    // This tag is only a consistency check; the actor always comes from Auth.
    if (expectedOwnerId !== undefined && expectedOwnerId !== actor.id) throw new ApiError(409, 'SESSION_CHANGED', 'A conta mudou. Confira os dados novamente antes de continuar.');
  };

  return {
    async getProfile(): Promise<ProfileDto> {
      const profile = await repository.getProfile(actor);
      if (!profile || profile.id !== actor.id) throw notFound();
      return { id: actor.id, name: profile.name, email: actor.email, ...(profile.defaultDelivery === undefined ? {} : { defaultDelivery: profile.defaultDelivery }) };
    },

    async updateProfile(name: string, expectedOwnerId?: string, defaultDelivery?: DefaultDelivery | null): Promise<ProfileDto> {
      assertExpectedOwner(expectedOwnerId);
      const parsed = profileName.safeParse(name);
      if (!parsed.success) throw new ApiError(400, 'INVALID_INPUT', 'Nome inválido.', { name: ['Informe um nome de até 120 caracteres.'] });
      let saved = defaultDelivery;
      if (saved !== undefined && saved !== null) {
        const preference = defaultDeliverySchema.safeParse(saved);
        if (!preference.success) throw new ApiError(400, 'INVALID_INPUT', 'Confira sua entrega padrão.');
        saved = preference.data;
      }
      const profile = saved === undefined ? await repository.updateProfile(actor, parsed.data) : await repository.updateProfile(actor, parsed.data, saved);
      if (!profile || profile.id !== actor.id) throw notFound();
      return { id: actor.id, name: profile.name, email: actor.email, ...(profile.defaultDelivery === undefined ? {} : { defaultDelivery: profile.defaultDelivery }) };
    },

    async listOrders(query: OrderListQuery = {}): Promise<OrderPage> {
      const limit = query.limit ?? 5;
      if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new ApiError(400, 'INVALID_INPUT', 'Limite de paginação inválido.', { limit: ['Use um número inteiro de 1 a 5.'] });
      const at = now();
      const rows = await repository.listOrders(actor, { limit: limit + 1, cursor: decodeCursor(query.cursor), now: at.toISOString() });
      const owned = rows.filter(order => activeOwnedOrder(order, actor, at.getTime()));
      const orders = owned.slice(0, limit);
      return { orders, nextCursor: owned.length > limit && orders.length ? encodeCursor(orders[orders.length - 1]) : null };
    },

    async getOrder(id: string): Promise<OrderDto> {
      if (!z.uuid().safeParse(id).success) throw notFound();
      const at = now();
      const order = await repository.getOrder(actor, id, at.toISOString());
      if (!order || order.id !== id || !activeOwnedOrder(order, actor, at.getTime())) throw notFound();
      return order;
    },

    async createOrder(input: CreateOrderInput, locale: Locale = 'pt-BR', expectedOwnerId?: string): Promise<OrderDto> {
      assertExpectedOwner(expectedOwnerId);
      const quote = await assertCheckoutReview(input, input.reviewToken, locale);
      const { reviewToken: _token, reviewExpiresAt: _expiry, ...draft } = quote;
      // One atomic RPC, with no retry, deduplication or application-memory quota check.
      const order = await repository.createOrder(actor, draft);
      if (!activeOwnedOrder(order, actor, now().getTime())) throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Não foi possível confirmar o resultado do pedido. Consulte seus pedidos antes de tentar novamente.');
      return order;
    },

    async deleteOrder(id: string, expectedOwnerId?: string): Promise<void> {
      assertExpectedOwner(expectedOwnerId);
      if (!z.uuid().safeParse(id).success) throw notFound();
      // The database RPC owns the deletion and associated-row transaction.
      if (!await repository.deleteOrder(actor, id)) throw notFound();
    },
  };
}

export async function getPrivateServices(request: Request) {
  const { authenticateRequest, createPrivateRepository } = await import('./supabase');
  const actor = await authenticateRequest(request);
  return createPrivateServices(actor, await createPrivateRepository(request, actor));
}
