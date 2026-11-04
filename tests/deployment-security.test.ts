import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertHostedDeployment, deploymentOrigins, trustedRequestOrigin } from '../src/server/deployment-config';
import { authOrigin } from '../src/server/auth-session';
import { apiRoute } from '../src/server/http';

const current = 'https://thunder-fang-unique-team.vercel.app';
const branch = 'https://thunder-fang-git-preview-team.vercel.app';
const production = 'https://thunder-fang.vercel.app';
const productionRef = 'p'.repeat(20);
const previewRef = 't'.repeat(20);
const reviewSecret = 'isolated-deployment-secret-with-more-than-32-bytes';

function previewEnvironment() {
  return {
    VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: new URL(current).host,
    VERCEL_BRANCH_URL: new URL(branch).host, NEXT_PUBLIC_SITE_URL: production,
    BACKEND_LOCAL_MODE: 'false', SUPABASE_PRODUCTION_PROJECT_REF: productionRef,
    SUPABASE_PREVIEW_PROJECT_REF: previewRef, NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_isolated_deployment_test',
    SUPABASE_SECRET_KEY: 'sb_secret_isolated_deployment_test', BACKEND_REVIEW_SECRET: reviewSecret,
  };
}
function configure(values = previewEnvironment()) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}
function mutation(destination: string, caller: string, extra: Record<string, string> = {}) {
  return new Request(destination + '/api/example', { method: 'POST',
    headers: { 'content-type': 'application/json', origin: caller, 'sec-fetch-site': 'same-origin', ...extra }, body: '{}' });
}

beforeEach(() => configure());
afterEach(() => vi.unstubAllEnvs());

describe('origens exatas das prévias e produção', () => {
  it('aceita somente os dois hosts da configuração deste deployment e conserva o host público atrás do proxy', () => {
    expect(deploymentOrigins()).toEqual([current, branch]);
    for (const site of [current, branch]) {
      expect(authOrigin(new Request(site + '/api/auth/callback'))).toBe(site);
      expect(authOrigin(new Request('http://localhost:3000/api/auth/callback', { headers: { host: new URL(site).host } }))).toBe(site);
    }
    for (const site of [production, 'https://other-team.vercel.app', 'https://evil.invalid', 'http://thunder-fang-unique-team.vercel.app']) {
      expect(() => authOrigin(new Request(site + '/api/auth/callback'))).toThrow();
    }
  });

  it('ignora cabeçalhos forwarded e recusa Host forjado, porta ou sintaxe alternativa', () => {
    for (const host of ['evil.invalid', 'other-team.vercel.app', new URL(current).host + ':444',
      new URL(current).host + '@evil.invalid', new URL(current).host + '/evil']) {
      const request = new Request(current + '/api/auth/callback', {
        headers: { host, 'x-forwarded-host': new URL(current).host, 'x-forwarded-proto': 'https' },
      });
      expect(trustedRequestOrigin(request)).toBeNull();
    }
  });

  it('exige que o Origin corresponda ao próprio alias, mesmo quando ambos são confiáveis', async () => {
    const route = apiRoute(() => Response.json({ accepted: true }), { mutation: true });
    for (const site of [current, branch]) expect((await route(mutation(site, site), undefined)).status).toBe(200);
    for (const [destination, caller] of [[current, branch], [branch, current], [current, production], [current, 'https://evil.invalid']]) {
      expect((await route(mutation(destination, caller), undefined)).status).toBe(403);
    }
    expect((await route(mutation(current, current, { host: 'evil.invalid' }), undefined)).status).toBe(403);
  });

  it('mantém a origem canônica em produção e não autoriza os hosts de preview', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(deploymentOrigins()).toEqual([production]);
    expect(authOrigin(new Request(production + '/api/auth/callback'))).toBe(production);
    expect(() => authOrigin(new Request(current + '/api/auth/callback'))).toThrow();
  });

  it('recusa variáveis de host malformadas sem usar a origem recebida como substituta', () => {
    for (const host of ['https://thunder-fang.vercel.app', 'evil.invalid', 'thunder-fang.vercel.app/route',
      'thunder-fang.vercel.app:443', 'thunder-fang.vercel.app@evil.invalid', '*.vercel.app', '']) {
      vi.stubEnv('VERCEL_URL', host);
      expect(() => deploymentOrigins()).toThrow();
      expect(() => authOrigin(new Request(current + '/api/auth/callback'))).toThrow();
    }
  });
});

describe('bloqueio de builds com bancos ou configuração incorretos', () => {
  it('permite preview e produção corretamente isolados e não exige serviços no CI/local', () => {
    const preview = previewEnvironment();
    expect(() => assertHostedDeployment(preview)).not.toThrow();
    expect(() => assertHostedDeployment({ ...preview, VERCEL_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co` })).not.toThrow();
    expect(() => assertHostedDeployment({ BACKEND_LOCAL_MODE: 'true' })).not.toThrow();
  });

  it('recusa banco de produção em preview, banco de preview em produção e refs repetidos ou ausentes', () => {
    const env = previewEnvironment();
    for (const invalid of [
      { ...env, NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co` },
      { ...env, VERCEL_ENV: 'production' },
      { ...env, SUPABASE_PREVIEW_PROJECT_REF: productionRef },
      { ...env, SUPABASE_PREVIEW_PROJECT_REF: '' },
      { ...env, SUPABASE_PRODUCTION_PROJECT_REF: '' },
      { ...env, NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co.evil.invalid` },
    ]) expect(() => assertHostedDeployment(invalid)).toThrow();
  });

  it('recusa modo local, origem HTTP pública e ausência dos segredos sem expor valores', () => {
    const env = previewEnvironment();
    for (const invalid of [
      { ...env, BACKEND_LOCAL_MODE: 'true' }, { ...env, VERCEL_ENV: '' },
      { ...env, SUPABASE_SECRET_KEY: '' }, { ...env, BACKEND_REVIEW_SECRET: 'short' },
      { ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_SECRET_KEY },
      { ...env, VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://thunder-fang.vercel.app', NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co` },
      { ...env, VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://localhost:3000', NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co` },
    ]) {
      try { assertHostedDeployment(invalid); throw new Error('Expected deployment rejection'); }
      catch (error) {
        expect((error as Error).message).toMatch(/^Invalid deployment configuration:/);
        expect((error as Error).message).not.toContain(reviewSecret);
        expect((error as Error).message).not.toContain(env.SUPABASE_SECRET_KEY);
      }
    }
  });
});
