import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import type { ProductDto } from '../src/contracts/api';
import { products } from '../src/domain/catalog';
import { MAX_QUANTITY, summarize } from '../src/domain/commerce';
import { catalogRevision, fetchCatalog, readCatalog } from '../src/features/catalog/catalog-model';
import { transactCart } from '../src/features/store/cart-database';

const catalogue = (): ProductDto[] => products.map((product,index) => ({ ...product, available: true, order: index + 1, canImage: `/images/cans/${product.slug}.png`, labelImage: `/images/labels/${product.slug}.png` }));

describe('catálogo de autoridade na interface', () => {
  it('recalcula preços maiores e menores sem recorrer ao preço estático', () => {
    const current = catalogue();
    current[0].priceInCents = 2000;
    expect(summarize([{slug:'original',quantity:6}],current)).toEqual({quantity:6,subtotal:12000,discount:1200,productsTotal:10800});
    current[0].priceInCents = 900;
    expect(summarize([{slug:'original',quantity:6}],current)).toEqual({quantity:6,subtotal:5400,discount:540,productsTotal:4860});
  });
  it('não usa preço zero ou estático para sabor ausente ou indisponível', () => {
    const current = catalogue(); current[0].available = false;
    expect(() => summarize([{slug:'original',quantity:1}],current)).toThrow('não está disponível');
    expect(() => summarize([{slug:'original',quantity:1}],current.slice(1))).toThrow('não está disponível');
    expect(() => summarize([{slug:'original',quantity:1}],[])).toThrow('não está disponível');
  });
  it('rejeita totais inseguros no preço atual, sem limitar comercialmente a quantidade', () => {
    const current = catalogue(); current[0].priceInCents = 1;
    expect(summarize([{slug:'original',quantity:MAX_QUANTITY}],current).subtotal).toBe(Number.MAX_SAFE_INTEGER);
    current[0].priceInCents = 2;
    expect(() => summarize([{slug:'original',quantity:MAX_QUANTITY}],current)).toThrow('faixa numérica segura');
  });
  it('a revisão muda com preço e disponibilidade, mas não com idioma ou texto', () => {
    const original = catalogue(); const translated = catalogue();
    translated[0].name = '原味'; translated[0].description = 'Texto traduzido';
    expect(catalogRevision(original)).toBe(catalogRevision(translated));
    translated[0].priceInCents += 1;
    expect(catalogRevision(original)).not.toBe(catalogRevision(translated));
    translated[0].priceInCents -= 1; translated[0].available = false;
    expect(catalogRevision(original)).not.toBe(catalogRevision(translated));
  });
  it('valida a resposta antes de aceitar preços, caminhos de imagem e slugs', () => {
    expect(readCatalog({products:catalogue()})).toEqual(catalogue());
    for (const override of [{priceInCents:0},{priceInCents:NaN},{slug:'unknown'},{canImage:'https://example.invalid/can.png'}]) {
      const current = catalogue(); Object.assign(current[0],override);
      expect(() => readCatalog({products:current})).toThrow('consultar o catálogo');
    }
    expect(() => readCatalog({products:[catalogue()[0],catalogue()[0]]})).toThrow();
  });
  it('consulta a API sem cache no idioma selecionado e falha sem fallback em indisponibilidade', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({products:catalogue()}),{status:200}));
    const controller = new AbortController();
    await expect(fetchCatalog('zh-Hans',controller.signal,fetcher)).resolves.toEqual(catalogue());
    expect(fetcher).toHaveBeenCalledWith('/api/products?locale=zh-Hans',expect.objectContaining({cache:'no-store',credentials:'same-origin',signal:controller.signal}));
    fetcher.mockResolvedValue(new Response('{}',{status:503}));
    await expect(fetchCatalog('pt-BR',controller.signal,fetcher)).rejects.toThrow('consultar o catálogo');
    fetcher.mockRejectedValue(new Error('Network failure'));
    await expect(fetchCatalog('pt-BR',controller.signal,fetcher)).rejects.toThrow();
  });
});

describe('persistência do carrinho independente de preços', () => {
  it('preserva a estrutura do carrinho mesmo quando o preço anterior tornaria o total inseguro', async () => {
    const huge = (await transactCart(state => ({...state,lastActivity:Date.now(),batches:[{id:'historical-price-one',slug:'original',quantity:MAX_QUANTITY}]}))).record;
    const result = await transactCart();
    expect(result.recovered).toBe(false);
    expect(result.record.generation).toBe(huge.generation);
    expect(result.record.batches).toEqual(huge.batches);
  });
  it('continua recuperando estrutura corrompida com IDs de lote duplicados', async () => {
    await transactCart(state => ({...state,lastActivity:Date.now(),batches:[{id:'duplicate',slug:'original',quantity:1},{id:'duplicate',slug:'citricos',quantity:1}]}));
    const result = await transactCart();
    expect(result.recovered).toBe(true);
    expect(result.record.batches).toEqual([]);
  });
});
