import { test, expect, type Page } from '@playwright/test';

test.use({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
  launchOptions: { args: ['--enable-unsafe-swiftshader'] },
});
test.skip(({ browserName }) => browserName !== 'chromium', 'The animated path requires a WebGL-capable browser.');

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('tf-demo-notice-v1', 'acknowledged'));
  await context.route('**/*', route => {
    if (new URL(route.request().url()).pathname === '/api/profile') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"code":"AUTH_REQUIRED"}' });
    }
    return ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort();
  });
});

async function expectAutomaticAnimation(page: Page) {
  const scene = page.locator('[data-orbit-journey]');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-three-status', 'ready', { timeout: 45_000 });
  await expect(scene).toHaveAttribute('data-animated', 'true');
  await expect(scene.locator('[data-orbit-can]')).toHaveCount(4);
  await expect(scene.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Animar latas|Animate cans)$/ })).toHaveCount(0);
}

async function expectScrollPose(page: Page, progress: number) {
  const scene = page.locator('[data-orbit-journey]');
  const bounds = await scene.evaluate(element => {
    const sticky = element.firstElementChild!;
    return {
      start: element.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(sticky).top),
      distance: element.getBoundingClientRect().height - sticky.getBoundingClientRect().height,
    };
  });
  expect(bounds.distance).toBeCloseTo(300, 0);
  await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), bounds.start + bounds.distance * progress);
  await expect(scene.locator('canvas')).toHaveAttribute('data-can-rendered-progress');
  await expect.poll(async () => Math.abs(Number(await scene.locator('canvas').getAttribute('data-can-rendered-progress')) - progress)).toBeLessThan(.005);
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test.describe(`automatic cans with ${reducedMotion}`, () => {
    test.use({ reducedMotion });

    test('load and replay without an activation button or saved permission', async ({ page, context }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      // Legacy links and preferences must not opt a visitor out of the automatic scene.
      await context.addInitScript(() => localStorage.setItem('tf-can-scroll-motion-v1', 'static'));
      await page.goto('/pt-BR?movimento=sistema#produtos', { waitUntil: 'networkidle' });
      await expectAutomaticAnimation(page);
      for (const progress of [0, 1 / 3, 2 / 3, 1, 0, 1 / 3]) await expectScrollPose(page, progress);
      await page.reload({ waitUntil: 'networkidle' });
      await expectAutomaticAnimation(page);
      await expectScrollPose(page, 2 / 3);
      expect(errors).toEqual([]);
    });
  });
}

test('automatic animation fits mobile and short landscape viewports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/en#produtos', { waitUntil: 'networkidle' });
  await expectAutomaticAnimation(page);
  await expectScrollPose(page, 1 / 3);
  await expect(page.getByText('Your device is set to reduce motion.', { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 844, height: 390 });
  await expectAutomaticAnimation(page);
  await expectScrollPose(page, 2 / 3);
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(size.document).toBeLessThanOrEqual(size.viewport + 1);
  expect(errors).toEqual([]);
});

test('unavailable WebGL retains all four static cans without an activation button', async ({ page, context }) => {
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return /webgl/i.test(type) ? null : Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto('/pt-BR#produtos', { waitUntil: 'networkidle' });
  const scene = page.locator('[data-orbit-journey]');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-three-status', 'fallback');
  await expect(scene).toHaveAttribute('data-animated', 'false');
  await expect(scene.locator('[data-orbit-can] img')).toHaveCount(4);
  for (const image of await scene.locator('[data-orbit-can] img').all()) await expect(image).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Animar latas|Animate cans)$/ })).toHaveCount(0);
});
