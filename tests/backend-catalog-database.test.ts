import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog, localCatalog } from '../src/server/catalog';
import { assertCurrentCheckoutReview, quoteCheckout, quoteShipping } from '../src/server/quotes';
import { GET as listProducts } from '../src/app/api/products/route';
import type { CheckoutInput } from '../src/contracts/api';

const input: CheckoutInput = {
  items: [{ slug: 'original', quantity: 6 }], method: 'standard',
  delivery: { country: 'BR', region: 'SP-CAPITAL', postal: '01001-000', street: '', number: '1', noNumber: false,
    complement: '', district: '', city: '', province: '', reference: '', instructions: '' },
};

function databaseRows(price = 1500) {
  const local = localCatalog();
  return {
    products: local.products.map(product => ({
      slug: product.slug, name: product.name, flavor_profile: product.flavorProfile, description: product.description,
      price_in_cents: price, volume_ml: product.volumeMl, image: product.image, accent: product.accent, background: product.background,
      ornament: product.ornament, available: true, sort_order: product.order,
      translations: ['pt-BR', 'en', 'es', 'zh-Hans'].map(locale => {
        const translated = localCatalog(locale as 'pt-BR').products.find(candidate => candidate.slug === product.slug)!;
        return { locale, name: translated.name, flavor_profile: translated.flavorProfile, description: translated.description };
      }),
    })),
    regions: [{ country: 'BR', code: 'SP-CAPITAL', name: 'São Paulo capital', zone: 'BR', base_price_in_cents: 1100,
      standard_min: null, standard_max: 8, express_min: 2, express_max: 4, reference_address: 'Referência configurada no banco' }],
  };
}

function serve(rows = databaseRows()) {
  const network = vi.fn(async (resource: RequestInfo | URL) => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource));
    return Response.json(url.pathname.endsWith('/products') ? rows.products : rows.regions);
  });
  vi.stubGlobal('fetch', network);
  return network;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://catalogue-tests.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-key-for-tests');
  vi.stubEnv('BACKEND_LOCAL_MODE', 'true');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3000');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('BACKEND_REVIEW_SECRET', 'catalogue-database-tests-stable-secret-32-bytes');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('catálogo persistido usado pelo backend', () => {
  it('entrega traduções e preços do banco nas rotas públicas, sem cache', async () => {
    const network = serve();
    const response = await listProducts(new Request('http://127.0.0.1:3000/api/products?locale=en'), undefined);
    expect(response.status).toBe(200);
    expect((await response.json()).products[1]).toMatchObject({ name: 'Citrus', priceInCents: 1500, canImage: '/images/cans/citricos.png' });
    expect(network).toHaveBeenCalledTimes(2);
    for (const call of network.mock.calls as unknown[][]) expect(call[1]).toMatchObject({ cache: 'no-store' });
  });

  it('calcula produtos, frete, prazos e endereço de referência da mesma configuração persistida', async () => {
    serve();
    const catalog = await loadCatalog();
    const quote = quoteCheckout(input, 'pt-BR', catalog);
    expect(quote).toMatchObject({ quantity: 6, subtotalInCents: 9000, discountInCents: 900, shippingInCents: 1100, totalInCents: 9200 });
    expect(quote.delivery).toMatchObject({ resolvedAddress: 'Referência configurada no banco', businessDays: { min: null, max: 8 } });
    expect(quoteShipping({ items: input.items, country: 'BR', region: 'SP-CAPITAL' }, 'pt-BR', catalog).options[1])
      .toEqual({ method: 'express', priceInCents: 1700, businessDays: { min: 2, max: 4 } });
  });

  it('recarrega a autoridade antes de gravar o pedido e exige revisão se o preço mudou', async () => {
    serve();
    const quote = quoteCheckout(input, 'pt-BR', await loadCatalog());
    serve(databaseRows(1501));
    await expect(assertCurrentCheckoutReview(input, quote.reviewToken)).rejects.toMatchObject({ status: 409, code: 'QUOTE_CHANGED' });
  });

  it('rejeita produto removido da seleção disponível sem recorrer ao preço local', async () => {
    const rows = databaseRows(); rows.products = rows.products.filter(product => product.slug !== 'original');
    serve(rows);
    const catalog = await loadCatalog();
    expect(() => quoteCheckout(input, 'pt-BR', catalog)).toThrowError(expect.objectContaining({ code: 'PRODUCT_UNAVAILABLE' }));
  });

  it('falha sem substituir dados quando o banco responde erro ou configurações inválidas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: 'private database error' }, { status: 403 })));
    await expect(loadCatalog()).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    const rows = databaseRows(); rows.products[0].price_in_cents = -1; serve(rows);
    await expect(loadCatalog()).rejects.toMatchObject({ status: 503 });
    const missing = databaseRows(); missing.products[0].translations = []; serve(missing);
    await expect(loadCatalog()).rejects.toMatchObject({ status: 503 });
  });

  it('permite a fonte local apenas no modo local explícito com ambas as variáveis ausentes', async () => {
    const network = serve();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ''); vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect((await loadCatalog()).products[0].priceInCents).toBe(1279);
    expect(network).not.toHaveBeenCalled();
    vi.stubEnv('BACKEND_LOCAL_MODE', 'false');
    await expect(loadCatalog()).rejects.toMatchObject({ status: 503 });
    vi.stubEnv('BACKEND_LOCAL_MODE', 'true'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://catalogue-tests.supabase.co');
    await expect(loadCatalog()).rejects.toMatchObject({ status: 503 });
  });
});
