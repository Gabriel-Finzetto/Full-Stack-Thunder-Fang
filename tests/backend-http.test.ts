import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as products } from '../src/app/api/products/route';
import { GET as product } from '../src/app/api/products/[slug]/route';
import { POST as shipping } from '../src/app/api/shipping/quote/route';
import { POST as checkout } from '../src/app/api/checkout/quote/route';
import { GET as profile, PATCH as patchProfile } from '../src/app/api/profile/route';
import { GET as orders, POST as createOrder } from '../src/app/api/orders/route';
import { GET as data } from '../src/app/api/data/route';
import { POST as contact } from '../src/app/api/contact/route';
import { apiRoute, MAX_BODY_BYTES } from '../src/server/http';
import { parse, checkoutSchema } from '../src/server/schemas';

const origin = 'http://127.0.0.1:3000';
const items = [{ slug: 'original', quantity: 6 }];
const body = { items, delivery: { country: 'BR', region: 'SP-CAPITAL', street: 'Endereço fictício' }, method: 'standard' };
function request(path: string, value: unknown, extra: Record<string, string> = {}) {
  return new Request(`${origin}/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...extra }, body: JSON.stringify(value) });
}
beforeEach(() => {
  vi.stubEnv('BACKEND_LOCAL_MODE', 'true'); vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin); vi.stubEnv('VERCEL', '');
  vi.stubEnv('BACKEND_REVIEW_SECRET', 'http-tests-stable-review-secret-at-least-32-bytes');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ''); vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ''); vi.stubEnv('SUPABASE_SECRET_KEY', ''); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('BREVO_API_KEY', '');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('rotas reais do backend', () => {
  it('entrega quatro produtos traduzidos, sem alterar preços ou depender do prefixo de página', async () => {
    const response = await products(new Request(`${origin}/api/products?locale=zh-Hans`), undefined);
    const result = await response.json();
    expect(response.status).toBe(200); expect(result.products).toHaveLength(4);
    expect(result.products[1]).toMatchObject({ name: '柑橘味', priceInCents: 1279, volumeMl: 500 });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it.each(['locale=fr', 'locale=en&locale=es', 'ownerId=forged', '__proto__=x'])('recusa consulta inválida: %s', async query => {
    const response = await products(new Request(`${origin}/api/products?${query}`), undefined);
    expect(response.status).toBe(400); expect((await response.json()).code).toBe('INVALID_INPUT');
  });
  it('retorna 404 para um produto inexistente', async () => {
    const response = await product(new Request(`${origin}/api/products/inexistente`), { params: Promise.resolve({ slug: 'inexistente' }) });
    expect(response.status).toBe(404);
  });
  it('calcula frete e revisão no servidor com valores do catálogo', async () => {
    const freight = await shipping(request('shipping/quote', { items, country: 'BR', region: 'SP-CAPITAL' }), undefined);
    expect(freight.status).toBe(200); expect((await freight.json()).quote.options[0].priceInCents).toBe(800);
    const response = await checkout(request('checkout/quote', body), undefined);
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.quote).toMatchObject({ subtotalInCents: 7674, discountInCents: 767, shippingInCents: 800, totalInCents: 7707 });
    expect(typeof result.quote.reviewToken).toBe('string');
    expect(Buffer.from(result.quote.reviewToken, 'base64url').toString()).not.toContain('Endereço fictício');
  });
  it.each([{ total: 1 }, { userId: 'forged' }, { coupon: 'FREE' }])('recusa campos de autoridade enviados pelo cliente: %j', async extra => {
    const response = await checkout(request('checkout/quote', { ...body, ...extra }), undefined);
    expect(response.status).toBe(400);
  });
  it('recusa uma região de outro país', async () => {
    const response = await shipping(request('shipping/quote', { items, country: 'US', region: 'SP-CAPITAL' }), undefined);
    expect(response.status).toBe(400);
  });
  it('recusa JSON inválido e expõe referência técnica sem conteúdo privado', async () => {
    const response = await shipping(new Request(`${origin}/api/shipping/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"secret":"address"' }), undefined);
    expect(response.status).toBe(400); expect(response.headers.get('x-request-id')).toMatch(/^[\da-f-]{36}$/);
    expect(await response.text()).not.toContain('address');
  });
  it('recusa formulário e origem externa antes de qualquer cálculo', async () => {
    const type = await shipping(new Request(`${origin}/api/shipping/quote`, { method: 'POST', body: 'items=1' }), undefined);
    expect(type.status).toBe(415);
    const crossSite = await checkout(request('checkout/quote', body, { origin: 'https://outro.example' }), undefined);
    expect(crossSite.status).toBe(403);
    const fetchSite = await checkout(request('checkout/quote', body, { 'sec-fetch-site': 'cross-site' }), undefined);
    expect(fetchSite.status).toBe(403);
  });
  it('exige origem em escrita autenticada por cookies', async () => {
    const response = await patchProfile(new Request(`${origin}/api/profile`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: 'sb-test-auth-token=example' }, body: '{"name":"Nome"}' }), undefined);
    expect(response.status).toBe(403);
  });
  it('limita o corpo real mesmo sem content-length informado', async () => {
    const response = await checkout(request('checkout/quote', { ...body, padding: 'x'.repeat(MAX_BODY_BYTES) }), undefined);
    expect(response.status).toBe(413);
  });
  it.each([profile, orders, data])('nega dados privados a uma requisição sem sessão', async handler => {
    const response = await handler(new Request(`${origin}/api/profile`), undefined);
    expect(response.status).toBe(401); expect((await response.json()).code).toBe('AUTH_REQUIRED');
    expect(response.headers.get('cache-control')).toContain('private, no-store');
  });
  it('não cria pedido de uma revisão pública sem autenticação', async () => {
    const quotation = await checkout(request('checkout/quote', body), undefined);
    const { quote } = await quotation.json();
    const response = await createOrder(request('orders', { ...body, reviewToken: quote.reviewToken }), undefined);
    expect(response.status).toBe(401);
  });
  it('não declara contato aceito quando não há transporte configurado', async () => {
    const response = await contact(request('contact', { name: 'Visitante', email: 'visitante@example.test', reason: 'other', message: 'Teste de validação local, não enviado.' }), undefined);
    expect(response.status).toBe(503); expect((await response.json()).code).toBe('SERVICE_UNAVAILABLE');
  });
  it('recusa escolha de destinatário pelo navegador', async () => {
    const response = await contact(request('contact', { name: 'Visitante', email: 'visitante@example.test', reason: 'other', message: 'Texto', recipient: 'outro@example.test' }), undefined);
    expect(response.status).toBe(400);
  });
  it('não executa a rota de cotação sem proteção compartilhada fora do modo local', async () => {
    vi.stubEnv('BACKEND_LOCAL_MODE', 'false');
    const response = await checkout(request('checkout/quote', body), undefined);
    expect(response.status).toBe(503);
  });
  it('permite DELETE vazio de mesma origem e oculta erros internos', async () => {
    const remove = apiRoute(() => new Response(null, { status: 204 }), { mutation: true });
    expect((await remove(new Request(`${origin}/api/orders/id`, { method: 'DELETE', headers: { origin } }), undefined)).status).toBe(204);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = apiRoute(() => { throw new Error('token-super-secret'); });
    const response = await failing(new Request(origin), undefined);
    expect(response.status).toBe(500); expect(await response.text()).not.toContain('super-secret');
  });
  it('normaliza endereço válido e não aceita apenas espaços ou campos extras', () => {
    const parsed = parse(checkoutSchema, body);
    expect(parsed.delivery.street).toBe('Endereço fictício'); expect(parsed.delivery.noNumber).toBe(false);
    expect(() => parse(checkoutSchema, { ...body, delivery: { country: 'BR', region: 'SP-CAPITAL', street: '  ' } })).toThrow();
    expect(() => parse(checkoutSchema, { ...body, delivery: { ...body.delivery, secret: 'x' } })).toThrow();
  });
});
