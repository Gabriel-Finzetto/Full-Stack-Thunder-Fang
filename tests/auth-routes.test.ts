import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as callback, POST as confirmCallback } from '../src/app/api/auth/callback/route';
import { GET as recovery } from '../src/app/api/auth/recovery/route';
import { POST as password } from '../src/app/api/auth/password/route';
import { createRecoveryMarker } from '../src/server/auth-session';

const mock = vi.hoisted(() => ({ client: vi.fn(), cookies: vi.fn(), rate: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mock.client }));
vi.mock('next/headers', () => ({ cookies: mock.cookies }));
vi.mock('../src/server/rate-limit', () => ({ enforceRateLimit: mock.rate }));
const id = '00000000-0000-4000-8000-000000000001';
const session = '00000000-0000-4000-8000-000000000002';
const user = { id, email_confirmed_at: '2026-10-28T10:00:00Z' };
let jar: Map<string,string>;
let auth: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL','http://127.0.0.1:3000');
  vi.stubEnv('BACKEND_LOCAL_MODE','true');
  vi.stubEnv('BACKEND_REVIEW_SECRET','an-isolated-route-test-secret-at-least-thirty-two-bytes');
  jar = new Map();
  mock.cookies.mockResolvedValue({ getAll: () => [...jar].map(([name,value]) => ({name,value})), get: (name:string) => jar.has(name) ? {name,value:jar.get(name)} : undefined, set: vi.fn((name:string,value:string) => jar.set(name,value)) });
  auth = {
    getUser: vi.fn().mockResolvedValue({data:{user},error:null}),
    getClaims: vi.fn().mockResolvedValue({data:{claims:{sub:id,session_id:session}},error:null}),
    exchangeCodeForSession: vi.fn().mockResolvedValue({data:{user},error:null}),
    verifyOtp: vi.fn().mockResolvedValue({data:{user},error:null}),
    updateUser: vi.fn().mockResolvedValue({data:{user},error:null}),
    signOut: vi.fn().mockResolvedValue({error:null}),
  };
  mock.client.mockReturnValue({auth});
  mock.rate.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const request = (body: unknown, origin='http://127.0.0.1:3000') => new Request('http://127.0.0.1:3000/api/auth/password',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function emailIntent(link: string) {
  const response = await callback(new Request(link));
  expect(response.status).toBe(200);
  const nonce = (await response.text()).match(/name="intent" value="([a-f0-9]{64})"/)?.[1];
  expect(nonce).toBeTruthy();
  const query = new URL(link).searchParams;
  const form = new URLSearchParams(['token_hash','type','locale','flow','retorno'].map(field => [field, query.get(field) ?? '']));
  form.set('intent', nonce!);
  return form;
}
const intentRequest = (form: URLSearchParams, origin = 'http://127.0.0.1:3000') => new Request('http://127.0.0.1:3000/api/auth/callback', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
async function confirmEmail(link: string) { return confirmCallback(intentRequest(await emailIntent(link))); }

describe('callback PKCE e confirmação', () => {
  it('troca o código, mantém idioma e permite apenas retorno aprovado', async () => {
    const response = await callback(new Request('http://127.0.0.1:3000/api/auth/callback?code=test-code&locale=es&retorno=https://example.invalid'));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('test-code');
    const url=new URL(response.headers.get('location')!);
    expect(url.origin).toBe('http://127.0.0.1:3000');
    expect(url.pathname).toBe('/es/carrinho');
    expect(url.search).toBe('');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(url.searchParams.has('code')).toBe(false);
  });
  it('autoriza redefinição somente após validar código e identidade, com marcador assinado', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({data:{user,redirectType:'recovery'},error:null});
    const response=await callback(new Request('http://127.0.0.1:3000/api/auth/callback?code=valid&flow=recovery&retorno=/checkout'));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/pt-BR/redefinir-senha');
    expect(jar.get('tf-recovery')).toBeTruthy();
    expect((await (await recovery(new Request('http://127.0.0.1:3000/api/auth/recovery'),undefined)).json()).allowed).toBe(true);
  });
  it('mantém a confirmação no mesmo host dos cookies apesar da normalização interna do Next', async () => {
    const response=await callback(new Request('http://localhost:3000/api/auth/callback?code=test-code',{headers:{Host:'127.0.0.1:3000'}}));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('test-code');
    const destination=new URL(response.headers.get('location')!);
    expect(destination.origin).toBe('http://127.0.0.1:3000');
    expect(destination.pathname).toBe('/pt-BR/carrinho');
    expect(destination.search).toBe('');
  });
  it.each(['pt-BR','en','es','zh-Hans'])('continua a compra automaticamente após confirmação no idioma %s', async locale => {
    const response=await confirmEmail(`http://127.0.0.1:3000/api/auth/callback?token_hash=valid&type=signup&locale=${locale}&retorno=/checkout`);
    expect(auth.verifyOtp).toHaveBeenCalledWith({token_hash:'valid',type:'signup'});
    expect(response.status).toBe(303);
    const destination=new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe(`/${locale}/carrinho`);
    expect(destination.search).toBe('');
  });
  it('seleciona o verificador da tentativa PKCE informada e não propaga o identificador', async () => {
    const response=await callback(new Request('http://127.0.0.1:3000/api/auth/callback?code=valid&sb_flow_id=flow_valid_123&retorno=/checkout'));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('valid',{flowId:'flow_valid_123'});
    expect(new URL(response.headers.get('location')!).pathname).toBe('/pt-BR/carrinho');
    expect(new URL(response.headers.get('location')!).search).toBe('');
    auth.exchangeCodeForSession.mockClear();
    const invalid=await callback(new Request('http://127.0.0.1:3000/api/auth/callback?code=valid&sb_flow_id=invalid&retorno=/checkout'));
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(new URL(invalid.headers.get('location')!).searchParams.get('estado')).toBe('invalido');
  });
  it('não continua a compra se o serviço não confirmar o e-mail', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({data:{user:{id,email_confirmed_at:null}},error:null});
    const response=await callback(new Request('http://127.0.0.1:3000/api/auth/callback?code=valid&retorno=/checkout'));
    const destination=new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/pt-BR/confirmar-email');
    expect(destination.searchParams.get('estado')).toBe('invalido');
    expect(destination.searchParams.get('retorno')).toBe('/carrinho');
  });
  it('recusa link expirado sem criar autorização de recuperação', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({data:{user:null},error:{code:'otp_expired'}});
    const response=await callback(new Request('http://127.0.0.1:3000/api/auth/callback?code=old&flow=recovery'));
    expect(new URL(response.headers.get('location')!).searchParams.get('estado')).toBe('expirado');
    expect(jar.has('tf-recovery')).toBe(false);
  });
  it('distingue a falta do verificador de uma confirmação ainda aguardando e preserva a compra', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({data:{user:null},error:{code:'pkce_code_verifier_not_found'}});
    const response=await callback(new Request('http://127.0.0.1:3000/api/auth/callback?code=valid&retorno=/checkout'));
    const destination=new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/pt-BR/confirmar-email');
    expect(destination.searchParams.get('estado')).toBe('sessao-ausente');
    expect(destination.searchParams.get('retorno')).toBe('/carrinho');
    expect(destination.searchParams.has('code')).toBe(false);
    expect(jar.has('tf-recovery')).toBe(false);
  });
  it('apresenta expiração recebida do provedor sem usar sua descrição como conteúdo ou autorização', async () => {
    const response=await callback(new Request('http://127.0.0.1:3000/api/auth/callback?error=access_denied&error_code=otp_expired&error_description=untrusted&retorno=/checkout'));
    const destination=new URL(response.headers.get('location')!);
    expect(destination.searchParams.get('estado')).toBe('expirado');
    expect(destination.searchParams.has('error_description')).toBe(false);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it('valida token de e-mail e recusa tipos não permitidos ou parâmetros ambíguos', async () => {
    await confirmEmail('http://127.0.0.1:3000/api/auth/callback?token_hash=hash&type=signup');
    expect(auth.verifyOtp).toHaveBeenCalledWith({token_hash:'hash',type:'signup'});
    auth.verifyOtp.mockClear();
    for (const suffix of ['token_hash=hash&type=email_change','token_hash=hash&type=signup&code=also-code']) {
      const result=await callback(new Request('http://127.0.0.1:3000/api/auth/callback?'+suffix));
      expect(new URL(result.headers.get('location')!).searchParams.get('estado')).toBe('invalido');
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it.each([undefined, '/conta', '/checkout', '/pedidos', '/carrinho', '//example.invalid', '/checkout?next=https://example.invalid'])('leva confirmações antigas ao carrinho, sem confiar no retorno %s', async oldReturn => {
    const link = new URL('http://127.0.0.1:3000/api/auth/callback?code=valid&flow=confirm&locale=en');
    if (oldReturn !== undefined) link.searchParams.set('retorno', oldReturn);
    jar.set('tf-recovery', 'old-recovery-marker');
    const response = await callback(new Request(link));
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('valid');
    const destination = new URL(response.headers.get('location')!);
    expect(destination.href).toBe('http://127.0.0.1:3000/en/carrinho');
    expect(jar.get('tf-recovery')).toBe('');
  });
  it('mantém recuperação por token no formulário de senha e preserva o retorno permitido', async () => {
    const response = await confirmEmail('http://127.0.0.1:3000/api/auth/callback?token_hash=valid&type=recovery&locale=zh-Hans&retorno=/checkout');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'valid', type: 'recovery' });
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/zh-Hans/redefinir-senha');
    expect(destination.searchParams.get('retorno')).toBe('/checkout');
    expect(jar.get('tf-recovery')).toBeTruthy();
  });
  it('não promove confirmação PKCE a recuperação por flags adulteradas da URL', async () => {
    const response = await callback(new Request('http://127.0.0.1:3000/api/auth/callback?code=signup-code&flow=recovery&type=recovery'));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/pt-BR/carrinho');
    expect(jar.get('tf-recovery')).toBe('');
  });
  it('não promove token de cadastro a recuperação por flow adulterado', async () => {
    const response = await confirmEmail('http://127.0.0.1:3000/api/auth/callback?token_hash=signup-token&type=signup&flow=recovery');
    expect(auth.verifyOtp).toHaveBeenCalledWith({token_hash:'signup-token',type:'signup'});
    expect(new URL(response.headers.get('location')!).pathname).toBe('/pt-BR/carrinho');
    expect(jar.get('tf-recovery')).toBe('');
  });
  it('reconhece recuperação PKCE pelo SDK mesmo quando a flag da URL foi removida', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({data:{user,redirectType:'recovery'},error:null});
    const response = await callback(new Request('http://127.0.0.1:3000/api/auth/callback?code=recovery-code&retorno=/checkout'));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/pt-BR/redefinir-senha');
    expect(jar.get('tf-recovery')).toBeTruthy();
  });
});

describe('consentimento explícito antes de aceitar links de e-mail sem PKCE', () => {
  const link = 'http://127.0.0.1:3000/api/auth/callback?token_hash=isolated-token&type=signup&locale=es&retorno=/checkout';
  it('GET não consome token nem altera sessão e oferece somente formulário de confirmação', async () => {
    const response = await callback(new Request(link));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('method="post"');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(mock.client).not.toHaveBeenCalled();
  });
  it('POST aceita apenas o formulário visto neste navegador e consome o nonce uma única vez', async () => {
    const form = await emailIntent(link);
    expect((await confirmCallback(intentRequest(form))).status).toBe(303);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect((await confirmCallback(intentRequest(form))).status).toBe(403);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  });
  it('recusa uma intenção vencida ou substituída por outro link no mesmo navegador', async () => {
    const original = await emailIntent(link);
    const newer = await emailIntent(link.replace('isolated-token', 'newer-isolated-token'));
    expect((await confirmCallback(intentRequest(original))).status).toBe(403);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    jar.delete('tf-auth-intent');
    expect((await confirmCallback(intentRequest(newer))).status).toBe(403);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it('vincula todos os campos de intenção e não interpreta valores de link como HTML', async () => {
    const poisoned = new URL(link);
    poisoned.searchParams.set('retorno', '\"><script>injected()</script>');
    const page = await callback(new Request(poisoned));
    const html = await page.text();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    const form = await emailIntent(link);
    for (const [field, value] of [['type','recovery'],['locale','en'],['flow','recovery'],['retorno','/pedidos']]) {
      const changed = new URLSearchParams(form); changed.set(field,value);
      expect((await confirmCallback(intentRequest(changed))).status).toBe(403);
    }
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it('recusa origem externa, nonce ausente e token trocado antes de chamar o serviço de acesso', async () => {
    const form = await emailIntent(link);
    expect((await confirmCallback(intentRequest(form, 'https://attacker.invalid'))).status).toBe(403);
    const missing = new URLSearchParams(form); missing.delete('intent');
    expect((await confirmCallback(intentRequest(missing))).status).toBe(403);
    const changed = new URLSearchParams(form); changed.set('token_hash', 'another-token');
    expect((await confirmCallback(intentRequest(changed))).status).toBe(403);
    const duplicated = new URLSearchParams(form); duplicated.append('type', 'recovery');
    expect((await confirmCallback(intentRequest(duplicated))).status).toBe(403);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(mock.client).not.toHaveBeenCalled();
  });
  it('limita o corpo e recusa conteúdo não compatível sem consumir token', async () => {
    await emailIntent(link);
    const response = await confirmCallback(intentRequest(new URLSearchParams({intent:'a'.repeat(64),token_hash:'x'.repeat(25000)})));
    expect(response.status).toBe(403);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
  it('usa cookie de intenção HttpOnly e restrito ao host em HTTPS, mantendo HTTP local', async () => {
    const localJar = await mock.cookies();
    await callback(new Request(link));
    expect(localJar.set).toHaveBeenCalledWith('tf-auth-intent', expect.any(String), expect.objectContaining({httpOnly:true,secure:false,sameSite:'lax',maxAge:600}));
    vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://thunderfang.example');
    await callback(new Request(link.replace('http://127.0.0.1:3000','https://thunderfang.example')));
    expect(localJar.set).toHaveBeenCalledWith('__Host-tf-auth-intent', expect.any(String), expect.objectContaining({httpOnly:true,secure:true,path:'/'}));
  });
});

describe('redefinição de senha', () => {
  const valid={password:'new-test-password',confirmation:'new-test-password'};
  it('recusa sessão comum sem marcador de recuperação', async () => {
    const response=await password(request(valid),undefined);
    expect(response.status).toBe(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('recusa marcador de outra sessão mesmo para o mesmo usuário', async () => {
    jar.set('tf-recovery',createRecoveryMarker(id,'00000000-0000-4000-8000-000000000003'));
    expect((await password(request(valid),undefined)).status).toBe(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('recusa origem externa, senhas divergentes ou campos administrativos extras', async () => {
    jar.set('tf-recovery',createRecoveryMarker(id,session));
    expect((await password(request(valid,'https://example.invalid'),undefined)).status).toBe(403);
    expect((await password(request({...valid,confirmation:'different'}),undefined)).status).toBe(400);
    expect((await password(request({...valid,user_id:id}),undefined)).status).toBe(400);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('atualiza a senha, consome o marcador e encerra sessões', async () => {
    jar.set('tf-recovery',createRecoveryMarker(id,session));
    const response=await password(request(valid),undefined);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({updated:true,sessionEnded:true});
    expect(auth.updateUser).toHaveBeenCalledWith({password:valid.password});
    expect(auth.signOut).toHaveBeenCalledWith({scope:'global'});
    expect(jar.get('tf-recovery')).toBe('');
  });
  it('não anuncia falha de alteração depois que a senha já mudou, se a saída falhar', async () => {
    jar.set('tf-recovery',createRecoveryMarker(id,session));
    auth.signOut.mockResolvedValue({error:{status:503}});
    expect(await (await password(request(valid),undefined)).json()).toEqual({updated:true,sessionEnded:false});
  });
  it('preserva o sucesso já confirmado quando a revogação lança falha de transporte', async () => {
    jar.set('tf-recovery',createRecoveryMarker(id,session));
    auth.signOut.mockRejectedValue(new Error('isolated network failure'));
    expect(await (await password(request(valid),undefined)).json()).toEqual({updated:true,sessionEnded:false});
    expect(jar.get('tf-recovery')).toBe('');
  });
});
