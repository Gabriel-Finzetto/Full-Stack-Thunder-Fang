import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';
import { browserAuthOptions } from '../src/features/account/auth-client';

const key = 'sb-pkce-test-auth-token';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'pkce@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-29T10:00:00Z', email_confirmed_at: '2026-10-29T10:01:00Z' };
const clients: Array<ReturnType<typeof createBrowserClient>> = [];
afterEach(async () => { await Promise.all(clients.splice(0).map(async client => { await client.auth.stopAutoRefresh(); await client.removeAllChannels(); })); });

function fixture(appendFlowId: boolean) {
  const jar = new Map<string,string>();
  let originalChallenge = '';
  let redirect = '';
  const tokenRequests: Array<{ auth_code: string; code_verifier: string }> = [];
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,aud:'authenticated',role:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})}.isolated-test-signature`;
  const cookies = {
    getAll: () => [...jar].map(([name,value]) => ({name,value})),
    setAll: (values: Array<{name:string;value:string;options:CookieOptions}>) => values.forEach(({name,value,options}) => { if (!value || options.maxAge === 0) jar.delete(name); else jar.set(name,value); }),
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (url.pathname === '/auth/v1/signup') {
      originalChallenge = body.code_challenge;
      redirect = url.searchParams.get('redirect_to')!;
      return Response.json({user:{...user,email_confirmed_at:null},session:null});
    }
    if (url.pathname === '/auth/v1/resend') return Response.json({code:'over_email_send_rate_limit',message:'Email rate limit exceeded'},{status:429});
    if (url.pathname === '/auth/v1/token') {
      tokenRequests.push(body);
      const challenge = createHash('sha256').update(body.code_verifier).digest('base64url');
      if (challenge !== originalChallenge || body.auth_code !== 'original-flow-code') return Response.json({code:'bad_code_verifier',message:'Incorrect verifier'},{status:400});
      return Response.json({access_token:accessToken,refresh_token:'isolated-test-refresh-token',token_type:'bearer',expires_in:3600,user});
    }
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    throw new Error(`Unexpected isolated Auth request: ${url.pathname}`);
  });
  const browser = createBrowserClient('https://example.supabase.co','sb_publishable_test',{
    isSingleton:false, cookieOptions:{name:key,path:'/',sameSite:'lax'}, cookies,
    auth:{...browserAuthOptions,experimental:{...browserAuthOptions.experimental,appendPkceFlowIdToRedirects:appendFlowId}},
    global:{fetch:fetchMock},
  });
  clients.push(browser);
  const server = () => {
    const client = createServerClient('https://example.supabase.co','sb_publishable_test',{cookieOptions:{name:key,path:'/',sameSite:'lax'},cookies,global:{fetch:fetchMock}});
    clients.push(client);
    return client;
  };
  return {browser,server,jar,tokenRequests,redirect:()=>new URL(redirect)};
}

async function signupAndFailedResend(test: ReturnType<typeof fixture>) {
  const options = {emailRedirectTo:'http://127.0.0.1:3000/api/auth/callback?locale=pt-BR&retorno=/checkout&flow=confirm'};
  const signup = await test.browser.auth.signUp({email:user.email,password:'isolated-test-A7!',options});
  expect(signup.error).toBeNull();
  expect(test.jar.has(`${key}-code-verifier`)).toBe(true);
  const resent = await test.browser.auth.resend({type:'signup',email:user.email,options});
  expect(resent.error?.status).toBe(429);
  expect(test.jar.has(`${key}-code-verifier`)).toBe(false);
  expect([...test.jar.keys()].some(name=>name.startsWith(`${key}-flow-`))).toBe(true);
}

describe('PKCE through real browser/server cookie adapters', () => {
  it('reproduces the original email losing the legacy verifier after a rate-limited resend', async () => {
    const test = fixture(false);
    await signupAndFailedResend(test);
    expect(test.redirect().searchParams.has('sb_flow_id')).toBe(false);
    const result = await test.server().auth.exchangeCodeForSession('original-flow-code');
    expect(result.error?.code).toBe('pkce_code_verifier_not_found');
    expect(test.tokenRequests).toHaveLength(0);
  });

  it('uses the original email’s own verifier after the failed resend and persists its confirmed session', async () => {
    expect(browserAuthOptions.experimental.appendPkceFlowIdToRedirects).toBe(true);
    const test = fixture(browserAuthOptions.experimental.appendPkceFlowIdToRedirects);
    await signupAndFailedResend(test);
    const flowId = test.redirect().searchParams.get('sb_flow_id');
    expect(flowId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    const server = test.server();
    const result = await server.auth.exchangeCodeForSession('original-flow-code',{flowId:flowId!});
    expect(result.error).toBeNull();
    expect(result.data.user?.id).toBe(user.id);
    expect(result.data.user?.email_confirmed_at).toBeTruthy();
    expect(test.tokenRequests).toHaveLength(1);
    expect([...test.jar.keys()].some(name=>name===key||name.startsWith(key+'.'))).toBe(true);
    expect((await test.server().auth.getUser()).data.user?.id).toBe(user.id);
  });

  it('never borrows a different flow’s verifier when the requested slot is absent', async () => {
    const test = fixture(true);
    const signup = await test.browser.auth.signUp({email:user.email,password:'isolated-test-A7!',options:{emailRedirectTo:'http://127.0.0.1:3000/api/auth/callback'}});
    expect(signup.error).toBeNull();
    expect(test.jar.has(`${key}-code-verifier`)).toBe(true);
    const result = await test.server().auth.exchangeCodeForSession('original-flow-code',{flowId:'different_flow_123'});
    expect(result.error?.code).toBe('pkce_code_verifier_not_found');
    expect(test.tokenRequests).toHaveLength(0);
    expect(test.jar.has(`${key}-code-verifier`)).toBe(true);
  });
});
