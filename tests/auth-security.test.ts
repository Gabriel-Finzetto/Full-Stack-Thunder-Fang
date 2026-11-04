import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authErrorMessage, authLocale, emailReturn, safeReturn } from '../src/features/account/auth-navigation';
import { authRedirect } from '../src/features/account/auth-client';
import { authOrigin, createRecoveryMarker, verifyRecoveryMarker } from '../src/server/auth-session';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';
const at = 1793224800000;
beforeEach(() => {
  vi.stubEnv('BACKEND_REVIEW_SECRET', 'isolated-test-secret-with-at-least-thirty-two-bytes');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3000');
  vi.stubEnv('BACKEND_LOCAL_MODE', 'true');
});
afterEach(() => vi.unstubAllEnvs());

describe('destinos de autenticação', () => {
  it('preserva somente os destinos aprovados, incluindo o retorno à compra', () => {
    for (const path of ['/carrinho','/checkout','/conta','/conta#meus-pedidos','/conta#meu-perfil','/conta#entrega-padrao','/perfil','/pedidos','/conta/meus-dados']) expect(safeReturn(path)).toBe(path);
    for (const path of ['https://example.invalid','//example.invalid','/\\example.invalid','/%2f%2fexample.invalid','/checkout?next=https://example.invalid','/admin','']) expect(safeReturn(path)).toBe('/conta');
  });
  it('recusa idiomas arbitrários e permite os quatro idiomas', () => {
    for (const locale of ['pt-BR','en','es','zh-Hans']) expect(authLocale(locale)).toBe(locale);
    expect(authLocale('../')).toBe('pt-BR');
  });
  it('retoma confirmação no carrinho sem alterar retornos de recuperação ou login', () => {
    for (const oldReturn of [null, undefined, '/conta', '/checkout', '/pedidos', 'https://example.invalid']) expect(emailReturn(oldReturn, 'confirm')).toBe('/carrinho');
    expect(emailReturn('/checkout', 'recovery')).toBe('/checkout');
    expect(emailReturn('/carrinho', 'recovery')).toBe('/carrinho');
    expect(emailReturn('https://example.invalid', 'recovery')).toBe('/conta');
    expect(safeReturn(null)).toBe('/conta');
  });
  it('gera links de confirmação e reenvio com retorno ao carrinho no callback, mantendo recuperação separada', () => {
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:3000' } });
    try {
      for (const locale of ['pt-BR', 'en', 'es', 'zh-Hans'] as const) {
        const confirm = new URL(authRedirect(locale, '/checkout', 'confirm'));
        expect(confirm.origin).toBe('http://127.0.0.1:3000');
        expect(confirm.pathname).toBe('/api/auth/callback');
        expect(confirm.searchParams.get('locale')).toBe(locale);
        expect(confirm.searchParams.get('retorno')).toBe('/carrinho');
        expect(confirm.searchParams.get('flow')).toBe('confirm');
      }
      const recovery = new URL(authRedirect('en', '/checkout', 'recovery'));
      expect(recovery.searchParams.get('retorno')).toBe('/checkout');
      expect(recovery.searchParams.get('flow')).toBe('recovery');
    } finally { vi.unstubAllGlobals(); }
  });
  it('permite as duas origens locais apenas no modo local explícito', () => {
    expect(authOrigin(new Request('http://localhost:3000/api/auth/callback'))).toBe('http://localhost:3000');
    expect(() => authOrigin(new Request('https://example.invalid/api/auth/callback'))).toThrow();
    vi.stubEnv('BACKEND_LOCAL_MODE','false');
    expect(() => authOrigin(new Request('http://localhost:3000/api/auth/callback'))).toThrow();
  });
  it('preserva o host do navegador quando Next normaliza a URL interna para localhost', () => {
    const request = new Request('http://localhost:3000/api/auth/callback', { headers: { Host: '127.0.0.1:3000' } });
    expect(authOrigin(request)).toBe('http://127.0.0.1:3000');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL','http://localhost:3000');
    expect(authOrigin(request)).toBe('http://127.0.0.1:3000');
    expect(authOrigin(new Request('http://127.0.0.1:3000/api/auth/callback', {headers:{Host:'localhost:3000'}}))).toBe('http://localhost:3000');
  });
  it('não aceita outra porta ou protocolo como alias local', () => {
    for (const value of ['http://localhost:4000','https://localhost:3000','http://127.0.0.1:4000']) {
      expect(() => authOrigin(new Request(value+'/api/auth/callback'))).toThrow();
    }
    expect(() => authOrigin(new Request('http://localhost:3000/api/auth/callback',{headers:{Host:'localhost:4000'}}))).toThrow();
  });
  it('recusa Host arbitrário ou malformado em vez de voltar para a URL interna válida', () => {
    for (const host of ['example.invalid','localhost:3000@evil.invalid','localhost:3000/evil','localhost:3000,evil.invalid','127.0.0.1%2e:3000','2130706433:3000']) {
      expect(() => authOrigin(new Request('http://127.0.0.1:3000/api/auth/callback',{headers:{Host:host}}))).toThrow();
    }
  });
  it('ignora cabeçalhos forwarded e não permite que eles autorizem outro Host', () => {
    const forwarded = {'x-forwarded-host':'evil.invalid','x-forwarded-proto':'https','forwarded':'host=evil.invalid;proto=https'};
    expect(authOrigin(new Request('http://localhost:3000/api/auth/callback',{headers:{...forwarded,Host:'127.0.0.1:3000'}}))).toBe('http://127.0.0.1:3000');
    expect(() => authOrigin(new Request('http://127.0.0.1:3000/api/auth/callback',{headers:{Host:'evil.invalid','x-forwarded-host':'127.0.0.1:3000'}}))).toThrow();
  });
  it('em produção usa somente o host configurado com o protocolo público configurado', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://thunderfang.example');
    vi.stubEnv('BACKEND_LOCAL_MODE','false');
    expect(authOrigin(new Request('http://localhost:3000/api/auth/callback',{headers:{Host:'thunderfang.example','x-forwarded-proto':'http'}}))).toBe('https://thunderfang.example');
    expect(authOrigin(new Request('https://thunderfang.example/api/auth/callback'))).toBe('https://thunderfang.example');
    for (const host of ['localhost:3000','127.0.0.1:3000','evil.invalid','thunderfang.example:444']) {
      expect(() => authOrigin(new Request('http://localhost:3000/api/auth/callback',{headers:{Host:host}}))).toThrow();
    }
    expect(() => authOrigin(new Request('http://thunderfang.example/api/auth/callback'))).toThrow();
  });
});

describe('autorização temporária de redefinição', () => {
  it('vincula o marcador assinado ao usuário e à sessão verificada', () => {
    const token = createRecoveryMarker(owner, session, at);
    expect(verifyRecoveryMarker(token, owner, session, at)).toBe(true);
    expect(verifyRecoveryMarker(token, other, session, at)).toBe(false);
    expect(verifyRecoveryMarker(token, owner, other, at)).toBe(false);
  });
  it('expira em dez minutos e recusa vencimento ou relógio anterior à emissão', () => {
    const token = createRecoveryMarker(owner, session, at);
    expect(verifyRecoveryMarker(token, owner, session, at + 599999)).toBe(true);
    expect(verifyRecoveryMarker(token, owner, session, at + 600000)).toBe(false);
    expect(verifyRecoveryMarker(token, owner, session, at - 1)).toBe(false);
  });
  it('recusa payload alterado, assinatura alterada e marcadores ausentes ou grandes', () => {
    const token = createRecoveryMarker(owner, session, at);
    const [payload, signature] = token.split('.');
    const changed = JSON.parse(Buffer.from(payload, 'base64url').toString());
    changed.user = other;
    expect(verifyRecoveryMarker(`${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${signature}`, other, session, at)).toBe(false);
    expect(verifyRecoveryMarker(`${payload}.${'x'.repeat(signature.length)}`, owner, session, at)).toBe(false);
    expect(verifyRecoveryMarker(undefined, owner, session, at)).toBe(false);
    expect(verifyRecoveryMarker('x'.repeat(1025), owner, session, at)).toBe(false);
  });
  it('não aceita marcador assinado com o segredo de outro ambiente', () => {
    const token = createRecoveryMarker(owner, session, at);
    vi.stubEnv('BACKEND_REVIEW_SECRET','a-different-isolated-secret-of-sufficient-length');
    expect(verifyRecoveryMarker(token, owner, session, at)).toBe(false);
  });
});

describe('erros de autenticação apresentados ao usuário', () => {
  it('não expõe mensagens arbitrárias do provedor', () => {
    expect(authErrorMessage({ status: 500 })).toBe('O serviço de acesso está temporariamente indisponível.');
    expect(authErrorMessage({ status: 400, code: 'unknown' })).toBe('Não foi possível concluir a solicitação. Tente novamente.');
    expect(authErrorMessage({ status: 429 })).toBe('Aguarde antes de tentar novamente.');
    expect(authErrorMessage({ status: 400, code: 'invalid_credentials' })).toBe('E-mail ou senha inválidos.');
  });
});
