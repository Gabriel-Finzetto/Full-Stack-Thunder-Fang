import { test, expect, type BrowserContext, type Page, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { products } from '../../src/domain/catalog';
import type { CheckoutInput, CheckoutQuoteDto, OrderDto } from '../../src/contracts/api';

const ownerId = '00000000-0000-4000-8000-000000000001';
const orderId = '00000000-0000-4000-8000-000000000011';
const profile = {
  id: ownerId,
  name: 'Conta de teste com nome extenso',
  email: 'conta.de.teste.com.endereco.longo@example.invalid',
  defaultDelivery: null,
};
const catalog = products.map((product, index) => ({ ...product, available: true, order: index + 1,
  canImage: `/images/cans/${product.slug}.png`, labelImage: `/images/labels/${product.slug}.png` }));
const screens = [
  { width: 320, height: 740 }, { width: 360, height: 800 }, { width: 390, height: 844 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 },
  { width: 844, height: 390 },
];
test.use({ actionTimeout: 15_000 });

function quoteFor(input: CheckoutInput): CheckoutQuoteDto {
  const items = input.items.map(item => ({ ...item, name: products.find(product => product.slug === item.slug)!.name,
    unitPriceInCents: 1279, lineTotalInCents: item.quantity * 1279 }));
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalInCents = items.reduce((sum, item) => sum + item.lineTotalInCents, 0);
  const discountInCents = quantity >= 6 ? Math.floor((subtotalInCents + 5) / 10) : 0;
  const shippingInCents = input.method === 'express' ? 1600 : 800;
  return { currency: 'BRL', items, quantity, subtotalInCents, discountInCents,
    productsTotalInCents: subtotalInCents - discountInCents, shippingInCents,
    totalInCents: subtotalInCents - discountInCents + shippingInCents,
    delivery: { ...input.delivery, regionName: 'São Paulo capital', zone: 'BR',
      resolvedAddress: input.delivery.street || 'Endereço demonstrativo', referenceApplied: !input.delivery.street,
      method: input.method, priceInCents: shippingInCents, businessDays: { min: null, max: 7 } },
    reviewToken: 'synthetic-review-never-sent-to-a-provider', reviewExpiresAt: new Date(Date.now() + 600_000).toISOString() };
}

function sampleOrder(): OrderDto {
  const { reviewToken: _token, reviewExpiresAt: _expires, ...quote } = quoteFor({ items: [{ slug: 'original', quantity: 1 }],
    delivery: { country: 'BR', region: 'SP-CAPITAL', postal: '', street: 'Rua de exemplo para teste', number: '',
      noNumber: false, complement: '', district: '', city: '', province: '', reference: '', instructions: '' }, method: 'standard' });
  return { ...quote, id: orderId, ownerId, number: 'TF-TESTE-RESPONSIVO', status: 'simulation_completed',
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
}

async function isolateProviders(context: BrowserContext, baseURL: string) {
  const local = new URL(baseURL);
  const blockedWrites: string[] = [];
  let authenticated = true;
  await context.addInitScript(() => localStorage.setItem('tf-demo-notice-v1', 'acknowledged'));
  await context.routeWebSocket('**', socket => {
    const url = new URL(socket.url());
    if (url.hostname === local.hostname && url.port === local.port) socket.connectToServer();
    else socket.close();
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.origin !== local.origin) return route.abort('blockedbyclient');
    if (url.pathname === '/api/products' && request.method() === 'GET') return json({ products: catalog });
    if (url.pathname === '/api/profile' && request.method() === 'GET') return authenticated ? json({ profile }) : json({ code: 'AUTH_REQUIRED' }, 401);
    if (url.pathname === '/api/orders' && request.method() === 'GET') return json({ orders: [sampleOrder()], nextCursor: null });
    if (url.pathname === `/api/orders/${orderId}` && request.method() === 'GET') return json({ order: sampleOrder() });
    if (url.pathname === '/api/shipping/quote' && request.method() === 'POST') {
      const input = request.postDataJSON();
      return json({ quote: { country: input.country, region: input.region, zone: 'BR', currency: 'BRL',
        quantity: input.items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0),
        options: [{ method: 'standard', priceInCents: 800, businessDays: { min: null, max: 7 } },
          { method: 'express', priceInCents: 1600, businessDays: { min: 1, max: 3 } }] } });
    }
    if (url.pathname === '/api/checkout/quote' && request.method() === 'POST') return json({ quote: quoteFor(request.postDataJSON()) });
    if (url.pathname.startsWith('/api/') || !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      blockedWrites.push(`${request.method()} ${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    // Synthetic UI identities must never be forwarded to a real Auth service.
    const headers = { ...request.headers() }; delete headers.cookie;
    return route.continue({ headers });
  });
  return { blockedWrites, useAnonymousSession() { authenticated = false; } };
}

async function expectNoHorizontalOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth }));
  expect(size.document, 'The document must fit its viewport without horizontal scrolling').toBeLessThanOrEqual(size.viewport + 1);
}

async function expectPanelFits(panel: Locator, page: Page) {
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox(), viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y).toBeGreaterThanOrEqual(-1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
  const size = await panel.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
}

async function reviewScreenshot(page: Page, name: string) {
  await mkdir('test-results/browser-review', { recursive: true });
  await page.screenshot({ path: `test-results/browser-review/${name}.png` });
}

async function expectControlsDoNotOverlap(first: Locator, second: Locator) {
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const a = (await first.boundingBox())!, b = (await second.boundingBox())!;
  expect(a.y + a.height <= b.y || b.y + b.height <= a.y || a.x + a.width <= b.x || b.x + b.width <= a.x,
    'Fixed controls must remain separately readable and clickable').toBe(true);
}

for (const screen of screens) {
  test(`storefront, shopping flow and account fit ${screen.width}×${screen.height}`, async ({ page, context, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(screen);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const provider = await isolateProviders(context, baseURL!);
    const errors: { message: string; stack?: string; url: string }[] = [];
    page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack, url: page.url() }));

    await page.goto('/pt-BR', { waitUntil: 'networkidle' });
    await expect(page.locator(`header summary[title="${profile.name}"]`)).toBeVisible();
    await expect(page.locator('main h1')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('button', { name: /^(Animar latas|Animate cans)$/ })).toHaveCount(0);
    if (screen.width === 1440) await reviewScreenshot(page, `${testInfo.project.name}-home-1440`);

    await page.locator('summary[aria-controls="navbar-produtos"]').click();
    const productMenu = page.locator('#navbar-produtos');
    await expectPanelFits(productMenu, page);
    if (screen.height === 390) await reviewScreenshot(page, `${testInfo.project.name}-menu-landscape`);
    await expect(productMenu.getByRole('link', { name: 'Ver catálogo completo' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(productMenu).not.toBeVisible();

    await page.getByRole('button', { name: 'Abrir central de ajuda', exact: true }).click();
    const help = page.getByRole('dialog', { name: 'Central Thunder Fang' });
    await expectPanelFits(help, page);
    await help.getByRole('tab', { name: 'Mensagens', exact: true }).click();
    await expect(help.locator('form')).toBeVisible();
    await help.getByRole('tab', { name: 'Ajuda', exact: true }).click();
    await expect(help.getByRole('searchbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).not.toBeVisible();

    await page.goto('/pt-BR/produtos', { waitUntil: 'networkidle' });
    await expect(page.locator('main article')).toHaveCount(4);
    await expectNoHorizontalOverflow(page);
    await page.goto('/pt-BR/produtos/original', { waitUntil: 'networkidle' });
    await expect(page.locator('main h1')).toHaveText('Original');
    await expectNoHorizontalOverflow(page);
    if (screen.width <= 760) {
      await page.locator('footer').scrollIntoViewIfNeeded();
      await expectControlsDoNotOverlap(page.locator('[data-mobile-purchase]:not([hidden])'),
        page.getByRole('button', { name: 'Abrir central de ajuda', exact: true }));
    }
    await page.getByRole('button', { name: 'Adicionar ao carrinho' }).first().click();
    const drawer = page.getByRole('dialog', { name: 'Carrinho', exact: true });
    await expectPanelFits(drawer, page);
    await drawer.getByRole('link', { name: 'Ver carrinho completo' }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page.locator('main h1')).toHaveText('Carrinho');
    await expectNoHorizontalOverflow(page);
    await expectControlsDoNotOverlap(page.locator('.store-notice'),
      page.getByRole('button', { name: 'Abrir central de ajuda', exact: true }));
    await page.locator('main').getByRole('link', { name: 'Finalizar pedido' }).click();
    await expect(page.getByRole('heading', { name: 'Identificação', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Conferir entrega' }).click();
    await page.getByLabel('Região de entrega', { exact: false }).selectOption('SP-CAPITAL');
    await page.locator('#delivery-street').fill('Rua de exemplo para teste');
    await expectNoHorizontalOverflow(page);
    await page.locator('.checkout-actions').getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('heading', { name: 'Escolha o frete' })).toBeVisible();
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Revisar pedido' }).click();
    await expect(page.getByRole('heading', { name: 'Confira sua escolha' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (screen.width === 320) await reviewScreenshot(page, `${testInfo.project.name}-checkout-320`);
    await expect(page.getByRole('button', { name: 'Confirmar simulação' })).toBeDisabled();

    await page.goto('/pt-BR/conta', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Meus pedidos', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Atualizar dados do perfil' }).click();
    await expect(page.locator('#profile-name')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Cancelar edição' }).click();
    await page.getByRole('button', { name: 'Excluir ou cancelar pedido', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Excluir ou cancelar pedido?' });
    await expectPanelFits(confirmation, page);
    await confirmation.getByRole('button', { name: 'Voltar ao pedido' }).click();
    await expect(confirmation).not.toBeVisible();

    provider.useAnonymousSession();
    for (const route of ['/login', '/cadastro', '/recuperar-senha']) {
      await page.goto(`/pt-BR${route}`, { waitUntil: 'networkidle' });
      await expect(page.locator('#account-email')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
    expect(provider.blockedWrites, 'No test may create orders, update profiles or send messages').toEqual([]);
  });
}

test('all locales fit a small screen and keyboard navigation remains available', async ({ page, context, baseURL }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await isolateProviders(context, baseURL!);
  for (const locale of ['pt-BR', 'en', 'es', 'zh-Hans']) {
    await page.goto(`/${locale}/produtos`, { waitUntil: 'networkidle' });
    await expect(page.locator('main article')).toHaveCount(4);
    await expectNoHorizontalOverflow(page);
    const skipLink = page.locator('a.skip-link');
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#conteudo$/);
  }
});

test('the catalogue remains usable without WebGL and with enlarged text', async ({ page, context, baseURL }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await isolateProviders(context, baseURL!);
  await context.addInitScript(`(() => { const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return /webgl/i.test(type) ? null : original.call(this, type, ...args);
    }; })();`);
  await page.goto('/pt-BR?movimento=latas', { waitUntil: 'networkidle' });
  await page.locator('[data-orbit-journey]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-orbit-journey]')).toHaveAttribute('data-three-status', 'fallback');
  await expect(page.locator('[data-orbit-journey]')).toHaveAttribute('data-animated', 'false');
  await expect(page.locator('[data-orbit-can] img')).toHaveCount(4);
  await expectNoHorizontalOverflow(page);
  await page.goto('/pt-BR/conta', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map(element => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }));
    for (const { element, size } of sizes) if (Number.isFinite(size)) element.style.fontSize = `${size * 2}px`;
  });
  await expect(page.getByRole('heading', { name: 'Minha conta', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
