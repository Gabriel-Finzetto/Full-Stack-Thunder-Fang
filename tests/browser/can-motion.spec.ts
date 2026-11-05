import { test, expect, type Page } from '@playwright/test';

const preferenceKey = 'tf-can-scroll-motion-v1';

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

test('visitors can activate stationary cans, replay the turn and restore reduced motion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/pt-BR#produtos', { waitUntil: 'networkidle' });
  const scene = page.locator('[data-orbit-journey]');
  const toggle = page.getByRole('button', { name: 'Animar latas', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(scene).toHaveAttribute('data-animated', 'false');
  await expect(scene.locator('[data-orbit-can] img').first()).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(scene).toHaveAttribute('data-three-status', 'ready', { timeout: 45_000 });
  for (const progress of [0, 1 / 3, 2 / 3, 1, 0, 1 / 3]) await expectScrollPose(page, progress);
  expect(await page.evaluate(key => localStorage.getItem(key), preferenceKey)).toBe('animate');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(scene).toHaveAttribute('data-three-status', 'ready', { timeout: 45_000 });
  await expectScrollPose(page, 2 / 3);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(scene).toHaveAttribute('data-three-status', 'idle');
  await expect(scene).toHaveAttribute('data-animated', 'false');
  await expect(scene.locator('[data-orbit-can] img').first()).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), preferenceKey)).toBeNull();
  await toggle.click();
  await expect(scene).toHaveAttribute('data-three-status', 'ready', { timeout: 45_000 });
  await expectScrollPose(page, 1 / 3);
  await toggle.click();
  await expect(scene).toHaveAttribute('data-three-status', 'idle');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(scene).toHaveAttribute('data-animated', 'false');
  expect(errors).toEqual([]);
});

test('a later button choice overrides an activation link after reload', async ({ page }) => {
  await page.goto('/pt-BR?movimento=latas#produtos', { waitUntil: 'networkidle' });
  const toggle = page.getByRole('button', { name: 'Animar latas', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(page).toHaveURL(/movimento=sistema#produtos$/);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-orbit-journey]')).toHaveAttribute('data-animated', 'false');
});

test('the mobile motion choice fits the viewport and is translated', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/en#produtos', { waitUntil: 'networkidle' });
  const toggle = page.getByRole('button', { name: 'Animate cans', exact: true });
  await expect(toggle).toBeVisible();
  await expect(page.getByText('Your device is set to reduce motion.', { exact: true })).toBeVisible();
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(size.document).toBeLessThanOrEqual(size.viewport + 1);
  await toggle.click();
  await expect(page.locator('[data-orbit-journey]')).toHaveAttribute('data-three-status', 'ready', { timeout: 45_000 });
  await expectScrollPose(page, 1 / 3);
});
