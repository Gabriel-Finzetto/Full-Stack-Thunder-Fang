import { test, expect } from '@playwright/test';

// A synthetic token and mismatched nonce exercise native form transport without
// passing readEmailIntent's guard, so no Auth request or SMTP can be triggered.
test('email intent preserves the form Origin without disclosing its token in Referer', async ({ page, context, baseURL, browserName }) => {
  const origin = new URL(baseURL!).origin;
  const https = new URL(origin).protocol === 'https:';
  for (const path of ['/pt-BR', '/api/profile', '/api/auth/callback-extra']) {
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    expect(response.headers()['x-frame-options']).toBe('DENY');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }
  const redirect = await context.request.get('/api/auth/callback', { maxRedirects: 0 });
  expect(redirect.status()).toBe(303);
  expect(redirect.headers()['referrer-policy']).toBe('no-referrer');
  const invalidPost = await context.request.post('/api/auth/callback', { maxRedirects: 0 });
  expect(invalidPost.status()).toBe(403);
  expect(invalidPost.headers()['referrer-policy']).toBe('no-referrer');
  const query = new URLSearchParams({ token_hash: 'a'.repeat(64), type: 'signup', locale: 'pt-BR', flow: 'confirm', retorno: '/carrinho' });
  const response = await page.goto(`/api/auth/callback?${query}`, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  expect(response?.headers()['referrer-policy']).toBe('strict-origin');
  expect(response?.headers()['cache-control']).toContain('no-store');
  expect(response?.headers()['content-security-policy']).toContain("form-action 'self'");
  expect(response?.headers()['content-security-policy']).toContain("default-src 'none'");
  const name = https ? '__Host-tf-auth-intent' : 'tf-auth-intent';
  const setCookie = (await response!.headerValues('set-cookie')).find(value => value.startsWith(`${name}=`));
  expect(setCookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
  expect(setCookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
  expect(setCookie).toMatch(/;\s*Path=\/(?:;|$)/i);
  expect(/;\s*Secure(?:;|$)/i.test(setCookie!)).toBe(https);
  const cookie = (await context.cookies()).find(item => item.name === name);
  expect(cookie).toMatchObject({ path: '/', secure: https, httpOnly: true });
  // Upstream v1.64.1 also expects Windows WebKit's cookie API to report None
  // for a Lax cookie. The emitted SameSite=Lax header is required above.
  // https://github.com/microsoft/playwright/blob/v1.64.1/tests/library/browsercontext-cookies.spec.ts#L122
  expect(cookie?.sameSite).toBe(process.platform === 'win32' && browserName === 'webkit' ? 'None' : 'Lax');
  expect(cookie?.value).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/);
  await expect(page.getByRole('heading', { name: 'Confirme seu acesso', exact: true })).toBeVisible();
  await expect(page.locator('form input[name="intent"]')).toHaveAttribute('value', cookie!.value.split('.')[0]);

  const invalidNonce = cookie!.value.startsWith('b'.repeat(64)) ? 'c'.repeat(64) : 'b'.repeat(64);
  await page.locator('form input[name="intent"]').evaluate((input, value) => { (input as HTMLInputElement).value = value; }, invalidNonce);
  const submitted = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/callback' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const rejected = await submitted;
  expect(rejected.status()).toBe(403);
  expect(await rejected.json()).toEqual({ code: 'INVALID_AUTH_INTENT' });
  expect(rejected.headers()['referrer-policy']).toBe('no-referrer');
  // Observe after the native network stack runs: routing may omit Cookie.
  const postedHeaders = await rejected.request().allHeaders();
  const postedFields = new URLSearchParams(rejected.request().postData()!);
  expect(postedHeaders?.origin).toBe(origin);
  expect(postedHeaders?.referer).toBe(`${origin}/`);
  expect(postedHeaders?.referer).not.toContain('token_hash');
  expect(postedHeaders?.cookie).toContain(`${name}=${cookie!.value}`);
  expect(postedFields?.get('intent')).toBe(invalidNonce);
  expect(postedFields?.get('token_hash')).toBe('a'.repeat(64));
});
