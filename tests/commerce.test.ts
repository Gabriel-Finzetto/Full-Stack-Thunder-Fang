import { describe, expect, it } from 'vitest';
import { consumeSnapshot, MAX_QUANTITY, summarize, validQuantity, type CartRecord } from '../src/domain/commerce';
import { quoteShipping, brazilRegions } from '../src/domain/shipping';
import { internationalRegions } from '../src/domain/regions';
import { preferredLocale } from '../src/i18n/config';

describe('valores aprovados no escopo', () => {
  it.each([[5, 6395, 0, 6395], [6, 7674, 767, 6907], [7, 8953, 895, 8058], [12, 15348, 1535, 13813]])('calcula %i unidades e arredonda uma única vez', (quantity, subtotal, discount, productsTotal) => { expect(summarize([{ slug: 'original', quantity }])).toEqual({ quantity, subtotal, discount, productsTotal }); });
  it('soma sabores antes de aplicar atacado', () => { expect(summarize([{ slug: 'original', quantity: 3 }, { slug: 'citricos', quantity: 3 }]).productsTotal).toBe(6907); });
  it('rejeita quantidades fracionadas e totais inseguros sem limite comercial artificial', () => { expect(validQuantity(0)).toBe(false); expect(validQuantity(1.5)).toBe(false); expect(validQuantity(MAX_QUANTITY)).toBe(true); expect(() => summarize([{ slug: 'original', quantity: MAX_QUANTITY }, { slug: 'citricos', quantity: 1 }])).toThrow(); });
});
describe('frete demonstrativo', () => {
  it.each([[6, 800], [7, 1000], [12, 1000], [13, 1200], [24, 1200], [25, 1400]])('São Paulo capital: quantidade%i', (quantity, expected) => { expect(quoteShipping('BR', 'SP-CAPITAL', quantity).standard).toBe(expected); });
  it('expresso sempre custa mais e respeita o teto em todos os destinos', () => {
    const cases: [Parameters<typeof quoteShipping>[0], string][] = [...brazilRegions.map(region => ['BR', region.code] as ['BR', string]), ['US', 'US-CA'], ['ES', 'ES-M'], ['CN', 'CN-BJ']];
    for (const [country, region] of cases) for (const quantity of [1, 6, 7, 12, 13, 24, 25, 1_000_000]) { const quote = quoteShipping(country, region, quantity); expect(quote.standard).toBeLessThanOrEqual(2400); expect(quote.express).toBeLessThanOrEqual(3000); expect(quote.express).toBeGreaterThan(quote.standard); }
  });
  it('possui cobertura e códigos únicos das subdivisões importadas', () => { expect(Object.fromEntries(Object.entries(internationalRegions).map(([key, values]) => [key, values.length]))).toEqual({ US: 57, ES: 52, CN: 34 }); for (const values of Object.values(internationalRegions)) expect(new Set(values.map(item => item.code)).size).toBe(values.length); });
});
describe('consumo dos lotes confirmados', () => {
  const state: CartRecord = { version: 1, generation: 'first', revision: 4, lastActivity: 0, batches: [{ id: 'A', slug: 'original', quantity: 4 }, { id: 'B', slug: 'original', quantity: 2 }], consumedOrders: [] };
  const snapshot = { generation: 'first', revision: 1, batches: [{ id: 'A', slug: 'original' as const, quantity: 6 }] };
  it('preserva as duas adições posteriores e não consome duas vezes', () => { const after = consumeSnapshot(state, snapshot, 'order-1'); expect(after.batches).toEqual([{ id: 'B', slug: 'original', quantity: 2 }]); expect(consumeSnapshot(after, snapshot, 'order-1')).toEqual(after); });
  it('não toca no carrinho recriado após expiração ou limpeza', () => { expect(consumeSnapshot({ ...state, generation: 'second' }, snapshot, 'order-1').batches).toEqual(state.batches); });
});
describe('preferência linguística', () => {
  it('respeita qualidade, escrita chinesa simplificada e fallback', () => { expect(preferredLocale('fr;q=0.9,es;q=0.8,en;q=0.5')).toBe('es'); expect(preferredLocale('zh-Hant,zh-TW;q=0.9,en;q=0.5')).toBe('en'); expect(preferredLocale('zh-Hans-CN')).toBe('zh-Hans'); expect(preferredLocale('de')).toBe('en'); expect(preferredLocale(null)).toBe('pt-BR'); });
});
