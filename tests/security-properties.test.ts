import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthActor, CheckoutInput, OrderDto } from '../src/contracts/api';
import { createPrivateServices, type PrivateRepository } from '../src/server/private-services';
import { localCatalog } from '../src/server/catalog';
import { assertCheckoutReview, quoteCheckout } from '../src/server/quotes';
import { signReview, verifyReview, REVIEW_LIFETIME_MS } from '../src/server/review';
import { checkoutSchema, createOrderSchema, profileSchema, shippingSchema } from '../src/server/schemas';
import { authLocale, emailReturn, localizedAuthPath, safeReturn } from '../src/features/account/auth-navigation';

const at = Date.parse('2026-11-03T12:00:00Z');
const uuid = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
const actors: AuthActor[] = Array.from({ length: 4 }, (_, index) => ({ id: uuid(index + 1), email: `fixture-${index + 1}@example.invalid` }));
const cases = { privateReads: 0, mutationGuards: 0, authorityFields: 0, authDestinations: 0, signedPayloads: 0, checkoutChanges: 0 };

function checkout(index = 0): CheckoutInput {
  const catalog = localCatalog();
  const countries = ['BR', 'US', 'ES', 'CN'] as const;
  const country = countries[index % countries.length];
  const region = catalog.regions.find(candidate => candidate.country === country)!;
  return {
    items: [{ slug: catalog.products[index % catalog.products.length].slug, quantity: [1, 5, 6, 12, 24, 49][Math.floor(index / 4) % 6] }],
    method: index % 2 ? 'express' : 'standard',
    delivery: { country, region: region.code, postal: '00000', street: `Rua fictícia ${index}`, number: '10', noNumber: false, complement: '', district: '', city: '', province: '', reference: '', instructions: '' },
  };
}

function order(owner: AuthActor, identity: number, expires: number): OrderDto {
  const { reviewToken: _token, reviewExpiresAt: _expiry, ...draft } = quoteCheckout(checkout());
  return { ...draft, id: uuid(identity), number: `TF-FIXTURE-${identity}`, ownerId: owner.id, status: 'simulation_completed', createdAt: new Date(at - 1000).toISOString(), expiresAt: new Date(expires).toISOString() };
}

function repository(actor: AuthActor, rows: OrderDto[] = []): PrivateRepository {
  return {
    getProfile: vi.fn(async () => ({ id: actor.id, name: 'Perfil fictício', email: actor.email })),
    updateProfile: vi.fn(async (_actor, name, defaultDelivery) => ({ id: actor.id, name, email: actor.email, ...(defaultDelivery === undefined ? {} : { defaultDelivery }) })),
    listOrders: vi.fn(async () => rows),
    getOrder: vi.fn(async (_actor, id) => rows.find(row => row.id === id) ?? null),
    createOrder: vi.fn(async () => rows[0]),
    deleteOrder: vi.fn(async () => true),
  };
}

beforeEach(() => {
  vi.stubEnv('BACKEND_REVIEW_SECRET', 'security-property-fixture-secret-with-at-least-32-bytes');
  vi.useFakeTimers();
  vi.setSystemTime(at);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(() => console.info('SECURITY_PROPERTY_CASES ' + JSON.stringify(cases)));

describe('invariantes gerados de isolamento, autoridade e integridade', () => {
  it('a saída privada continua limitada ao ator mesmo com registros misturados e respostas tardias de outro proprietário', async () => {
    for (const actor of actors) for (const foreign of actors.filter(candidate => candidate.id !== actor.id)) for (const limit of [1, 2, 3, 4, 5]) {
      const allowed = Array.from({ length: 6 }, (_, index) => order(actor, 100 + index, at + (index + 1) * 1000));
      const disallowed = [order(foreign, 200, at + 5000), order(actor, 201, at), order(actor, 202, at - 1), order(foreign, 203, at - 1)];
      const rows = [disallowed[0], allowed[0], disallowed[1], ...allowed.slice(1, 3), ...disallowed.slice(2), ...allowed.slice(3)];
      const repo = repository(actor, rows);
      const services = createPrivateServices(actor, repo, { now: () => new Date(at) });
      const page = await services.listOrders({ limit });
      expect(page.orders.map(row => row.id)).toEqual(allowed.slice(0, limit).map(row => row.id));
      expect(page.orders.every(row => row.ownerId === actor.id)).toBe(true);
      for (const row of disallowed) await expect(services.getOrder(row.id)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      vi.mocked(repo.getProfile).mockResolvedValue({ id: foreign.id, name: 'Segredo de outra conta', email: foreign.email });
      await expect(services.getProfile()).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      cases.privateReads += 6;
    }
  });

  it('mutações com identidade esperada divergente nunca atingem a persistência', async () => {
    for (const actor of actors) for (const expected of [...actors.map(candidate => candidate.id), '', 'client-owner', undefined]) {
      const repo = repository(actor);
      const services = createPrivateServices(actor, repo);
      if (expected !== undefined && expected !== actor.id) {
        await expect(services.updateProfile('Nome do formulário anterior', expected)).rejects.toMatchObject({ status: 409, code: 'SESSION_CHANGED' });
        await expect(services.deleteOrder(uuid(500), expected)).rejects.toMatchObject({ status: 409, code: 'SESSION_CHANGED' });
        expect(repo.updateProfile).not.toHaveBeenCalled();
        expect(repo.deleteOrder).not.toHaveBeenCalled();
      } else {
        const result = await services.updateProfile('Nome autorizado', expected);
        expect(result).toMatchObject({ id: actor.id, email: actor.email });
        await services.deleteOrder(uuid(500), expected);
        expect(repo.updateProfile).toHaveBeenCalledExactlyOnceWith(actor, 'Nome autorizado');
        expect(repo.deleteOrder).toHaveBeenCalledExactlyOnceWith(actor, uuid(500));
      }
      cases.mutationGuards += 2;
    }
  });

  it('campos de autoridade e objetos de entrega adulterados são recusados antes da regra de negócio', () => {
    const input = checkout();
    const profile = { name: 'Fixture', defaultDelivery: { delivery: input.delivery, method: input.method } };
    const bases = [
      { schema: checkoutSchema, value: input },
      { schema: createOrderSchema, value: { ...input, reviewToken: 'fixture-token' } },
      { schema: profileSchema, value: profile },
      { schema: shippingSchema, value: { items: input.items, country: input.delivery.country, region: input.delivery.region } },
    ];
    const fields = ['id', 'user_id', 'ownerId', 'email', 'role', 'is_admin', 'priceInCents', 'totalInCents', 'recipient', '__proto__', 'constructor', 'prototype'];
    const values = [null, true, 0, 'forged-owner', { role: 'admin' }];
    for (const { schema, value } of bases) {
      expect(schema.safeParse(value).success).toBe(true);
      for (const field of fields) for (const valueOfField of values) {
        const changed = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
        Object.defineProperty(changed, field, { value: valueOfField, enumerable: true, configurable: true });
        expect(schema.safeParse(changed).success, `top-level ${field}`).toBe(false);
        cases.authorityFields++;
      }
    }
    for (const field of ['ownerId', 'priceInCents', 'businessDays', 'resolvedAddress', 'reviewToken', 'user_id', '__proto__']) for (const value of values) {
      const changed = structuredClone(input);
      Object.defineProperty(changed.delivery, field, { value, enumerable: true });
      expect(checkoutSchema.safeParse(changed).success, `delivery ${field}`).toBe(false);
      expect(profileSchema.safeParse({ ...profile, defaultDelivery: { delivery: changed.delivery, method: input.method } }).success, `saved delivery ${field}`).toBe(false);
      cases.authorityFields += 2;
    }
  });

  it('destinos de autenticação mutados nunca saem da origem nem ganham um destino não aprovado', () => {
    const approved = ['/carrinho', '/checkout', '/pedidos', '/conta', '/conta#meus-pedidos', '/conta#meu-perfil', '/conta#entrega-padrao', '/conta/meus-dados', '/perfil'];
    const fragments = ['https://evil.invalid/', '//evil.invalid/', '/\\evil.invalid/', 'javascript:alert(1)', 'data:text/html,fixture', '\r\nLocation:https://evil.invalid', '%2f%2fevil.invalid', '\u202eevil.invalid', '\u0000', '?next=https://evil.invalid', '#https://evil.invalid', '/..', '/%2e%2e', ' '];
    const candidates: (string | null | undefined)[] = [null, undefined, '', ...approved];
    for (const path of approved) for (const fragment of fragments) candidates.push(fragment + path, path + fragment, encodeURIComponent(fragment + path));
    for (const candidate of candidates) {
      const destination = safeReturn(candidate);
      expect(destination).toBe(candidate && approved.includes(candidate) ? candidate : '/conta');
      for (const locale of ['pt-BR', 'en', 'es', 'zh-Hans', '../evil', '//evil.invalid', '']) {
        const url = new URL(localizedAuthPath(authLocale(locale), destination), 'https://store.example.invalid');
        expect(url.origin).toBe('https://store.example.invalid');
        expect(url.username).toBe('');
        expect(url.password).toBe('');
      }
      expect(emailReturn(candidate, 'confirm')).toBe('/carrinho');
      expect(emailReturn(candidate, 'recovery')).toBe(destination);
      cases.authDestinations++;
    }
  });

  it('uma assinatura não autoriza outra carga, não expõe a entrega e deixa de valer no instante da expiração', () => {
    for (let index = 0; index < 32; index++) {
      vi.setSystemTime(at);
      const payload = { owner: actors[index % actors.length].id, amount: index + 1, address: `PRIVATE-FIXTURE-ADDRESS-${index}-NOT-FOR-TOKEN`, nested: { currency: 'BRL', count: index + 2 }, items: [index, index + 1] };
      const signed = signReview(payload);
      expect(Buffer.from(signed.reviewToken, 'base64url').toString('utf8')).not.toContain(payload.address);
      expect(() => verifyReview(signed.reviewToken, { items: payload.items, nested: { count: index + 2, currency: 'BRL' }, address: payload.address, amount: payload.amount, owner: payload.owner })).not.toThrow();
      for (const changed of [
        { ...payload, owner: actors[(index + 1) % actors.length].id },
        { ...payload, amount: payload.amount + 1 },
        { ...payload, address: payload.address + '-CHANGED' },
        { ...payload, nested: { ...payload.nested, currency: 'USD' } },
        { ...payload, nested: { ...payload.nested, count: 0 } },
        { ...payload, items: [index + 1, index] },
      ]) {
        expect(() => verifyReview(signed.reviewToken, changed)).toThrowError(expect.objectContaining({ status: 409, code: 'QUOTE_CHANGED' }));
        cases.signedPayloads++;
      }
      const token = JSON.parse(Buffer.from(signed.reviewToken, 'base64url').toString('utf8'));
      for (const changed of [{ ...token, exp: token.exp + 1 }, { ...token, exp: token.exp - 1 }, { ...token, sig: (token.sig[0] === 'A' ? 'B' : 'A') + token.sig.slice(1) }, { ...token, v: 2 }]) {
        expect(() => verifyReview(Buffer.from(JSON.stringify(changed)).toString('base64url'), payload)).toThrowError(expect.objectContaining({ code: 'QUOTE_CHANGED' }));
        cases.signedPayloads++;
      }
      vi.setSystemTime(at + REVIEW_LIFETIME_MS - 1);
      expect(() => verifyReview(signed.reviewToken, payload)).not.toThrow();
      for (const time of [at + REVIEW_LIFETIME_MS, at + REVIEW_LIFETIME_MS + 1]) {
        vi.setSystemTime(time);
        expect(() => verifyReview(signed.reviewToken, payload)).toThrowError(expect.objectContaining({ code: 'QUOTE_CHANGED' }));
        cases.signedPayloads++;
      }
    }
  });

  it('a revisão financeira é invalidada por alteração de cada campo de entrega, quantidade, modalidade ou catálogo', () => {
    for (let index = 0; index < 24; index++) {
      const input = checkout(index);
      const catalog = localCatalog();
      const quote = quoteCheckout(input, 'pt-BR', catalog);
      expect(assertCheckoutReview(input, quote.reviewToken, 'en', catalog).totalInCents).toBe(quote.totalInCents);
      const changes: CheckoutInput[] = [
        { ...input, items: [{ ...input.items[0], quantity: input.items[0].quantity + 1 }] },
        { ...input, method: input.method === 'standard' ? 'express' : 'standard' },
      ];
      for (const field of ['postal', 'street', 'number', 'complement', 'district', 'city', 'province', 'reference', 'instructions'] as const) changes.push({ ...input, delivery: { ...input.delivery, [field]: input.delivery[field] + '-CHANGED' } });
      changes.push({ ...input, delivery: { ...input.delivery, noNumber: !input.delivery.noNumber } });
      const otherRegion = catalog.regions.find(region => region.country === input.delivery.country && region.code !== input.delivery.region)!;
      changes.push({ ...input, delivery: { ...input.delivery, region: otherRegion.code } });
      const otherCountry = catalog.regions.find(region => region.country !== input.delivery.country)!;
      changes.push({ ...input, delivery: { ...input.delivery, country: otherCountry.country, region: otherCountry.code } });
      for (const changed of changes) {
        expect(() => assertCheckoutReview(changed, quote.reviewToken, 'pt-BR', catalog)).toThrowError(expect.objectContaining({ status: 409, code: 'QUOTE_CHANGED' }));
        cases.checkoutChanges++;
      }
      const newPrices = structuredClone(catalog);
      newPrices.products.find(product => product.slug === input.items[0].slug)!.priceInCents++;
      expect(() => assertCheckoutReview(input, quote.reviewToken, 'pt-BR', newPrices)).toThrowError(expect.objectContaining({ status: 409, code: 'QUOTE_CHANGED' }));
      cases.checkoutChanges++;
    }
  });
});
