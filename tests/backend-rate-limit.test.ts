import { afterEach, describe, expect, it, vi } from 'vitest';
import { enforceRateLimit } from '../src/server/rate-limit';

const request = () => new Request('https://portfolio.example.test/api/shipping/quote');
function configure() {
  vi.stubEnv('BACKEND_LOCAL_MODE', ''); vi.stubEnv('VERCEL', '');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://portfolio.example.test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.test');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test_key'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('BACKEND_REVIEW_SECRET', 'r'.repeat(32));
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('limitação distribuída de requisições', () => {
  it('permite bypass somente em modo local explícito e com requisição local', async () => {
    configure(); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3000'); vi.stubEnv('BACKEND_LOCAL_MODE', 'true');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(enforceRateLimit(new Request('http://127.0.0.1:3000/api/shipping/quote'), 'quote')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    await expect(enforceRateLimit(request(), 'quote')).rejects.toMatchObject({ status: 503 });
  });

  it('não dispensa o contador em produção mesmo que a flag local esteja ligada', async () => {
    configure(); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000'); vi.stubEnv('BACKEND_LOCAL_MODE', 'true'); vi.stubEnv('VERCEL', '1'); vi.stubEnv('SUPABASE_SECRET_KEY', '');
    await expect(enforceRateLimit(new Request('http://localhost:3000/api/shipping/quote'), 'quote')).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it.each(['quote', 'private', 'contact'] as const)('consulta o contador persistido do escopo %s', async scope => {
    configure(); const fetchMock = vi.fn().mockResolvedValue(Response.json({ allowed: true, retryAfter: 0 })); vi.stubGlobal('fetch', fetchMock);
    await expect(enforceRateLimit(request(), scope)).resolves.toBeUndefined();
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://project.example.test/rest/v1/rpc/tf_rate_limit');
    expect(options.headers.apikey).toBe('sb_secret_test_key');
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(options.body)).toMatchObject({ p_limit: scope === 'contact' ? 5 : 120, p_window_seconds: 60 });
    expect(JSON.parse(options.body).p_key).toMatch(/^[0-9a-f]{64}$/);
    expect(options).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('não permite escolher outro bucket com cabeçalhos de IP falsificados', async () => {
    configure(); const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ allowed: true, retryAfter: 0 }))); vi.stubGlobal('fetch', fetchMock);
    await enforceRateLimit(new Request(request(), { headers: { 'x-forwarded-for': '1.1.1.1' } }), 'quote');
    await enforceRateLimit(new Request(request(), { headers: { 'x-forwarded-for': '9.9.9.9' } }), 'quote');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).p_key).toBe(JSON.parse(fetchMock.mock.calls[1][1].body).p_key);
    expect(fetchMock.mock.calls[0][1].body).not.toContain('1.1.1.1');
  });

  it('retorna 429 com prazo de recuperação do contador', async () => {
    configure(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ allowed: false, retryAfter: 17 })));
    await expect(enforceRateLimit(request(), 'quote')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfter: 17 });
  });

  it.each([{}, { allowed: 'true', retryAfter: 0 }, { allowed: true }, { allowed: false, retryAfter: -1 }, [{ allowed: true, retryAfter: 0 }]])('falha fechada diante de contrato inválido: %j', async result => {
    configure(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result)));
    await expect(enforceRateLimit(request(), 'quote')).rejects.toMatchObject({ status: 503 });
  });

  it('não usa contador de memória quando a dependência falha', async () => {
    configure(); const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network failed')); vi.stubGlobal('fetch', fetchMock);
    await expect(enforceRateLimit(request(), 'contact')).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('não admite credenciais públicas ou segredo curto para a proteção de produção', async () => {
    configure(); vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_publishable_invalid_for_admin');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(enforceRateLimit(request(), 'private')).rejects.toMatchObject({ status: 503 });
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test'); vi.stubEnv('BACKEND_REVIEW_SECRET', 'short');
    await expect(enforceRateLimit(request(), 'private')).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantém suporte à chave service_role legada somente no servidor', async () => {
    configure(); vi.stubEnv('SUPABASE_SECRET_KEY', ''); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'legacy.service.jwt');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ allowed: true, retryAfter: 0 })); vi.stubGlobal('fetch', fetchMock);
    await enforceRateLimit(request(), 'private');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer legacy.service.jwt');
  });
});
