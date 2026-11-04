import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as catalog from '../src/server/catalog';
import { calculateItems, quoteShipping, quoteCheckout, assertCheckoutReview } from '../src/server/quotes';
import { ApiError } from '../src/server/errors';
import type { CheckoutInput, DeliveryInput, ItemInput } from '../src/contracts/api';
import type { Country } from '../src/domain/shipping';

function delivery(changes: Partial<DeliveryInput> = {}): DeliveryInput {
  return { country: 'BR', region: 'SP-CAPITAL', postal: '', street: 'Rua de teste', number: '1', noNumber: false,
    complement: '', district: '', city: '', province: '', reference: '', instructions: '', ...changes };
}
function checkout(changes: Partial<CheckoutInput> = {}): CheckoutInput {
  return { items: [{ slug: 'original', quantity: 6 }], delivery: delivery(), method: 'standard', ...changes };
}
function expectApiError(action: () => unknown, code: string, status: number) {
  try { action(); throw new Error('Expected an API error.'); }
  catch (error) { expect(error).toBeInstanceOf(ApiError); expect(error).toMatchObject({ code, status }); }
}

beforeEach(() => { vi.stubEnv('BACKEND_REVIEW_SECRET', 'backend-tests-review-secret-at-least-32-bytes-long'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('catálogo público do servidor', () => {
  it.each([
    ['pt-BR', 'Cítricos'], ['en', 'Citrus'], ['es', 'Cítricos'], ['zh-Hans', '柑橘味'],
  ] as const)('localiza o texto em %s sem alterar valores ou identidade', (locale, name) => {
    const items = catalog.listProducts(locale);
    expect(items.map(item => item.slug)).toEqual(['original', 'citricos', 'tropicais', 'frutas-vermelhas']);
    expect(items[1]).toMatchObject({ name, volumeMl: 500, priceInCents: 1279, available: true, order: 2,
      canImage: '/images/cans/citricos.png', labelImage: '/images/labels/citricos.png' });
  });
  it('entrega cópias sem permitir que uma consulta mude o catálogo usado para cobrar', () => {
    const exposed = catalog.listProducts();
    exposed[0].priceInCents = 1;
    exposed.splice(1);
    expect(catalog.listProducts()).toHaveLength(4);
    expect(catalog.findProduct('original')?.priceInCents).toBe(1279);
  });
  it('não inventa produto inexistente nem altera a revisão por idioma', () => {
    const revision = catalog.getCatalogRevision();
    expect(catalog.findProduct('nao-existe')).toBeUndefined();
    catalog.listProducts('zh-Hans');
    expect(catalog.getCatalogRevision()).toBe(revision);
    expect(revision).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('preços e atacado autorizados pelo servidor', () => {
  it.each([
    [1, 1279, 0, 1279], [5, 6395, 0, 6395], [6, 7674, 767, 6907],
    [7, 8953, 895, 8058], [12, 15348, 1535, 13813],
  ])('calcula %i latas com arredondamento único', (quantity, subtotal, discount, total) => {
    expect(calculateItems([{ slug: 'original', quantity }])).toMatchObject({ quantity, subtotalInCents: subtotal,
      discountInCents: discount, productsTotalInCents: total });
  });
  it('soma sabores e repetições antes de aplicar o limiar de seis', () => {
    const result = calculateItems([{ slug: 'citricos', quantity: 2 }, { slug: 'original', quantity: 1 },
      { slug: 'citricos', quantity: 1 }, { slug: 'frutas-vermelhas', quantity: 2 }]);
    expect(result).toMatchObject({ quantity: 6, subtotalInCents: 7674, discountInCents: 767, productsTotalInCents: 6907 });
    expect(result.items.map(item => [item.slug, item.quantity])).toEqual([['original', 1], ['citricos', 3], ['frutas-vermelhas', 2]]);
  });
  it.each([0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejeita quantidade inválida %s', quantity => {
    expectApiError(() => calculateItems([{ slug: 'original', quantity }]), 'INVALID_INPUT', 400);
  });
  it('rejeita seleção vazia e slug desconhecido em vez de calcular preço zero', () => {
    expectApiError(() => calculateItems([]), 'INVALID_INPUT', 400);
    expectApiError(() => calculateItems([{ slug: 'desconhecido', quantity: 1 }] as unknown as ItemInput[]), 'PRODUCT_UNAVAILABLE', 409);
  });
  it('rejeita um produto desativado pelo catálogo de autoridade', () => {
    const product = catalog.findProduct('original')!;
    vi.spyOn(catalog, 'findProduct').mockReturnValue({ ...product, available: false });
    expectApiError(() => calculateItems([{ slug: 'original', quantity: 1 }]), 'PRODUCT_UNAVAILABLE', 409);
  });
  it('não aceita uma configuração inválida de preço do próprio servidor', () => {
    const product = catalog.findProduct('original')!;
    vi.spyOn(catalog, 'findProduct').mockReturnValue({ ...product, priceInCents: 0 });
    expectApiError(() => calculateItems([{ slug: 'original', quantity: 1 }]), 'INTERNAL_ERROR', 500);
  });
  it('mantém cálculo inteiro exato perto do limite técnico sem impor limite comercial', () => {
    const quantity = Math.floor(Number.MAX_SAFE_INTEGER / 1279);
    const result = calculateItems([{ slug: 'original', quantity }]);
    const subtotal = BigInt(quantity) * 1279n;
    const discount = (subtotal + 5n) / 10n;
    expect(result.subtotalInCents).toBe(Number(subtotal));
    expect(result.discountInCents).toBe(Number(discount));
    expect(result.productsTotalInCents).toBe(Number(subtotal - discount));
  });
  it('rejeita estouro causado pela soma de linhas ou pelo agrupamento', () => {
    const quantity = Math.floor(Number.MAX_SAFE_INTEGER / 1279);
    expectApiError(() => calculateItems([{ slug: 'original', quantity }, { slug: 'citricos', quantity }]), 'INVALID_INPUT', 400);
    expectApiError(() => calculateItems([{ slug: 'original', quantity: Number.MAX_SAFE_INTEGER }, { slug: 'original', quantity: 1 }]), 'INVALID_INPUT', 400);
  });
});

describe('frete nacional e internacional demonstrativo no servidor', () => {
  it.each([
    ['SP-CAPITAL', 800], ['SP-OTHER', 1200], ['SOUTH-SOUTHEAST', 1600],
    ['CENTER-WEST', 1800], ['NORTHEAST', 2000], ['NORTH', 2200],
  ])('aplica a faixa nacional %s', (region, standard) => {
    const quote = quoteShipping({ items: [{ slug: 'original', quantity: 1 }], country: 'BR', region });
    expect(quote).toMatchObject({ country: 'BR', region, zone: 'BR', currency: 'BRL', quantity: 1 });
    expect(quote.options).toEqual([
      { method: 'standard', priceInCents: standard, businessDays: { min: null, max: 7 } },
      { method: 'express', priceInCents: standard + 600, businessDays: { min: 2, max: 3 } },
    ]);
  });
  it.each([
    ['US', 'US-CA', 'NA', 1800, 2400, 10, 16],
    ['ES', 'ES-M', 'EU', 2000, 2600, 10, 18],
    ['CN', 'CN-BJ', 'AS', 2200, 2800, 12, 25],
  ] as const)('calcula país e região válidos de %s', (country, region, zone, standard, express, min, max) => {
    const quote = quoteShipping({ items: [{ slug: 'original', quantity: 1 }], country, region });
    expect(quote.zone).toBe(zone);
    expect(quote.options[0]).toEqual({ method: 'standard', priceInCents: standard, businessDays: { min, max } });
    expect(quote.options[1].priceInCents).toBe(express);
  });
  it.each([[6, 800], [7, 1000], [12, 1000], [13, 1200], [24, 1200], [25, 1400]])('aplica o acréscimo por quantidade %i', (quantity, priceInCents) => {
    expect(quoteShipping({ items: [{ slug: 'original', quantity }], country: 'BR', region: 'SP-CAPITAL' }).options[0].priceInCents).toBe(priceInCents);
  });
  it('respeita os tetos mesmo no maior acréscimo internacional', () => {
    const quote = quoteShipping({ items: [{ slug: 'tropicais', quantity: 1000 }], country: 'CN', region: 'CN-BJ' });
    expect(quote.options.map(option => option.priceInCents)).toEqual([2400, 3000]);
  });
  it.each([['BR', 'US-CA'], ['US', 'SP-CAPITAL'], ['ES', 'US-CA'], ['CN', 'ES-M'], ['US', 'US-INVALID']])('rejeita região incompatível %s/%s', (country, region) => {
    expectApiError(() => quoteShipping({ items: [{ slug: 'original', quantity: 1 }], country: country as Country, region }), 'INVALID_INPUT', 400);
  });
  it.each(['XX', '__proto__', 'toString'])('rejeita país desconhecido %s', country => {
    expectApiError(() => quoteShipping({ items: [{ slug: 'original', quantity: 1 }], country: country as Country, region: 'US-CA' }), 'INVALID_INPUT', 400);
  });
});

describe('revisão de checkout e proteção de valores aceitos', () => {
  it('preserva a entrega completa sem substituir uma rua informada', () => {
    const address = delivery({ street: 'Avenida Particular 999', postal: '00000-000', complement: 'Bloco A', district: 'Teste',
      city: 'Cidade', province: 'SP', reference: 'Portão lateral', instructions: 'Interfone fictício' });
    const quote = quoteCheckout(checkout({ delivery: address }));
    expect(quote.delivery).toMatchObject({ ...address, resolvedAddress: address.street, referenceApplied: false,
      regionName: 'São Paulo capital', zone: 'BR', method: 'standard', priceInCents: 800 });
    expect(quote.totalInCents).toBe(7707);
    expect(quote.reviewToken).not.toContain(address.street);
    expect(quote.reviewToken).not.toContain(Buffer.from(address.street).toString('base64'));
  });
  it('usa referência apenas na linha vazia e mantém os outros campos', () => {
    const quote = quoteCheckout(checkout({ delivery: delivery({ street: '', city: 'Cidade fictícia', reference: 'Entrada dos fundos' }) }));
    expect(quote.delivery).toMatchObject({ street: '', city: 'Cidade fictícia', reference: 'Entrada dos fundos', referenceApplied: true,
      resolvedAddress: 'Praça da Sé, Sé, São Paulo, SP, CEP 01001-000' });
  });
  it('não altera o objeto de rascunho recebido', () => {
    const input = checkout(); const original = structuredClone(input);
    quoteCheckout(input);
    expect(input).toEqual(original);
  });
  it('rejeita quantidade diferente da revisão aceita', () => {
    const input = checkout(); const quote = quoteCheckout(input);
    expectApiError(() => assertCheckoutReview({ ...input, items: [{ slug: 'original', quantity: 7 }] }, quote.reviewToken), 'QUOTE_CHANGED', 409);
  });
  it('rejeita alteração de destino, modalidade ou instruções depois da revisão', () => {
    const input = checkout(); const quote = quoteCheckout(input);
    for (const changed of [
      checkout({ delivery: delivery({ country: 'US', region: 'US-CA' }) }),
      checkout({ method: 'express' }),
      checkout({ delivery: delivery({ instructions: 'Instrução alterada' }) }),
    ]) expectApiError(() => assertCheckoutReview(changed, quote.reviewToken), 'QUOTE_CHANGED', 409);
  });
  it('obriga nova revisão quando o preço do catálogo muda', () => {
    const input = checkout(); const quote = quoteCheckout(input); const product = catalog.findProduct('original')!;
    vi.spyOn(catalog, 'findProduct').mockReturnValue({ ...product, priceInCents: 1280 });
    expectApiError(() => assertCheckoutReview(input, quote.reviewToken), 'QUOTE_CHANGED', 409);
  });
  it('aceita a mesma seleção com outra ordem e particionamento de linhas', () => {
    const input = checkout({ items: [{ slug: 'original', quantity: 3 }, { slug: 'citricos', quantity: 3 }] });
    const quote = quoteCheckout(input);
    const confirmed = assertCheckoutReview({ ...input, items: [{ slug: 'citricos', quantity: 1 }, { slug: 'original', quantity: 3 }, { slug: 'citricos', quantity: 2 }] }, quote.reviewToken);
    expect(confirmed.items).toEqual(quote.items);
  });
  it('permite trocar o idioma sem alterar o conteúdo financeiro aceito', () => {
    const input = checkout({ items: [{ slug: 'citricos', quantity: 6 }] });
    const quote = quoteCheckout(input, 'pt-BR');
    const confirmed = assertCheckoutReview(input, quote.reviewToken, 'en');
    expect(confirmed.items[0].name).toBe('Citrus');
    expect(confirmed.delivery.regionName).toBe('São Paulo city');
    expect(confirmed.totalInCents).toBe(quote.totalInCents);
  });
  it('rejeita referência de revisão inválida e expirada', () => {
    const input = checkout();
    expectApiError(() => assertCheckoutReview(input, 'token-invalido'), 'QUOTE_CHANGED', 409);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    const quote = quoteCheckout(input);
    vi.setSystemTime(new Date(Date.parse(quote.reviewExpiresAt) + 1000));
    expectApiError(() => assertCheckoutReview(input, quote.reviewToken), 'QUOTE_CHANGED', 409);
  });
  it('não deduplica revisões repetidas nem altera os itens solicitados', () => {
    const input = checkout(); const quote = quoteCheckout(input);
    expect(assertCheckoutReview(input, quote.reviewToken).totalInCents).toBe(7707);
    expect(assertCheckoutReview(input, quote.reviewToken).totalInCents).toBe(7707);
    expect(input.items).toEqual([{ slug: 'original', quantity: 6 }]);
  });
});
