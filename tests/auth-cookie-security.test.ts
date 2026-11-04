import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({ browser: vi.fn(), server: vi.fn(), cookies: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createBrowserClient: mock.browser, createServerClient: mock.server }));
vi.mock('next/headers', () => ({ cookies: mock.cookies }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_isolated_cookie_test');
  mock.browser.mockReturnValue({});
  mock.cookies.mockResolvedValue({getAll: () => [],set:vi.fn()});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('session cookie security in all writing paths', () => {
  it.each(['http:', 'https:'])('browser marks session cookies Secure only over HTTPS (%s)', async protocol => {
    vi.stubGlobal('window', { location: { protocol } });
    const { getAuthClient } = await import('../src/features/account/auth-client');
    getAuthClient();
    expect(mock.browser).toHaveBeenCalledWith(expect.any(String),expect.any(String),expect.objectContaining({cookieOptions:expect.objectContaining({sameSite:'lax',path:'/',secure:protocol==='https:'})}));
  });
  it.each(['http:', 'https:'])('server cookie writer follows trusted configured origin (%s)', async protocol => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', protocol + '//thunderfang.example');
    const { createAuthServerClient } = await import('../src/server/auth-session');
    await createAuthServerClient();
    expect(mock.server).toHaveBeenCalledWith(expect.any(String),expect.any(String),expect.objectContaining({cookieOptions:expect.objectContaining({sameSite:'lax',path:'/',secure:protocol==='https:'})}));
  });
  it('normalizes the configured HTTPS protocol before setting auth callback cookies', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'HTTPS://thunderfang.example');
    const { createAuthServerClient } = await import('../src/server/auth-session');
    await createAuthServerClient();
    expect(mock.server.mock.calls[0][2].cookieOptions.secure).toBe(true);
  });
  it('uses Secure for preview cookies even when the development origin was accidentally retained', async () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'thunder-fang-preview-team.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3000');
    const { createAuthServerClient } = await import('../src/server/auth-session');
    await createAuthServerClient();
    expect(mock.server.mock.calls[0][2].cookieOptions.secure).toBe(true);
  });
  it('preserves Secure in the preview proxy behind TLS termination', async () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_URL', 'thunder-fang-preview-team.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3000');
    mock.server.mockImplementation((_url,_key,options) => ({auth:{getUser:async () => {
      options.cookies.setAll([{name:'sb-example-auth-token',value:'isolated-cookie',options:options.cookieOptions}]);
      return {data:{user:null},error:null};
    }}}));
    const { proxy } = await import('../src/proxy');
    const response = await proxy(new NextRequest('http://localhost:3000/pt-BR',{headers:{cookie:'sb-example-auth-token=isolated-old-cookie'}}));
    expect(response.cookies.get('sb-example-auth-token')?.secure).toBe(true);
  });
  it('preserves Secure behind TLS termination with a normalized configured HTTPS origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'HTTPS://thunderfang.example');
    mock.server.mockImplementation((_url,_key,options) => ({auth:{getUser:async () => {
      options.cookies.setAll([{name:'sb-example-auth-token',value:'isolated-cookie',options:options.cookieOptions}]);
      return {data:{user:null},error:null};
    }}}));
    const { proxy } = await import('../src/proxy');
    const response = await proxy(new NextRequest('http://localhost:3000/pt-BR',{headers:{cookie:'sb-example-auth-token=isolated-old-cookie'}}));
    expect(response.cookies.get('sb-example-auth-token')?.secure).toBe(true);
  });
  it.each(['http:', 'https:'])('proxy preserves Secure when refreshed cookies reach the response (%s)', async protocol => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', protocol + '//thunderfang.example');
    mock.server.mockImplementation((_url,_key,options) => ({auth:{getUser:async () => {
      options.cookies.setAll([{name:'sb-example-auth-token',value:'isolated-cookie',options:{...options.cookieOptions,maxAge:60}}]);
      return {data:{user:null},error:null};
    }}}));
    const { proxy } = await import('../src/proxy');
    const request = new NextRequest(protocol + '//thunderfang.example/pt-BR',{headers:{cookie:'sb-example-auth-token=isolated-old-cookie'}});
    const response = await proxy(request);
    const cookie = response.cookies.get('sb-example-auth-token');
    expect(cookie?.secure ?? false).toBe(protocol==='https:');
    expect(cookie?.sameSite).toBe('lax');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});
