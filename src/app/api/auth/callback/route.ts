import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authLocale, emailReturn, localizedAuthPath } from '@/features/account/auth-navigation';
import { authOrigin, createAuthServerClient, createRecoveryMarker, recoveryCookie, recoveryCookieOptions, recoveryIdentity } from '@/server/auth-session';
import { confirmEmailIntent, readEmailIntent } from '@/server/auth-callback-intent';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  return callback(request, new URL(request.url).searchParams, false);
}
export async function POST(request: Request) {
  try {
    const query = await readEmailIntent(request);
    if (query) return callback(request, query, true);
  } catch { /* Invalid origins, bodies and stale intent never reach Auth. */ }
  return Response.json({ code: 'INVALID_AUTH_INTENT' }, { status: 403, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
async function callback(request: Request, query: URLSearchParams, confirmedIntent: boolean) {
  const locale = authLocale(query.get('locale'));
  let flow: 'confirm' | 'recovery' = query.get('flow') === 'recovery' || query.get('type') === 'recovery' ? 'recovery' : 'confirm';
  let returnTo = emailReturn(query.get('retorno'), flow);
  let origin: string;
  try { origin = authOrigin(request); } catch { return Response.json({ code: 'SERVICE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } }); }
  const finish = (path: string, state?: string) => {
    const destination = new URL(localizedAuthPath(locale, path), origin);
    if (path === '/confirmar-email' || path === '/redefinir-senha') destination.searchParams.set('retorno', returnTo);
    if (state) destination.searchParams.set('estado', state);
    const response = NextResponse.redirect(destination, 303);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Pragma', 'no-cache');
    return response;
  };
  try {
    const code = query.get('code');
    const token = query.get('token_hash');
    const type = query.get('type');
    const flowId = query.get('sb_flow_id');
    const validToken = token && token.length <= 4096 && !code && ['signup','email','invite','recovery'].includes(type ?? '');
    if (validToken && !confirmedIntent) return confirmEmailIntent(query, origin, locale);
    const client = await createAuthServerClient();
    let result;
    if (code && code.length <= 4096 && !token && (flowId === null || /^[A-Za-z0-9_-]{8,64}$/.test(flowId))) {
      result = flowId ? await client.auth.exchangeCodeForSession(code, { flowId }) : await client.auth.exchangeCodeForSession(code);
    }
    else if (validToken && confirmedIntent) result = await client.auth.verifyOtp({ token_hash: token, type: type as 'signup' | 'email' | 'invite' | 'recovery' });
    if (!result || result.error || !result.data.user?.email_confirmed_at) {
      const code = result?.error?.code ?? query.get('error_code');
      const state = flow === 'confirm' && code === 'pkce_code_verifier_not_found' ? 'sessao-ausente'
        : code === 'otp_expired' || code === 'flow_state_expired' ? 'expirado' : 'invalido';
      return finish(flow === 'recovery' ? '/redefinir-senha' : '/confirmar-email', state);
    }
    // URL flags choose error presentation only. Recovery authority comes from
    // the verified token type or the SDK's locally bound PKCE recovery flow.
    flow = token ? type === 'recovery' ? 'recovery' : 'confirm' : 'redirectType' in result.data && result.data.redirectType === 'recovery' ? 'recovery' : 'confirm';
    returnTo = emailReturn(query.get('retorno'), flow);
    const jar = await cookies();
    if (flow === 'recovery') {
      const actor = await recoveryIdentity(client);
      if (!actor) return finish('/redefinir-senha','invalido');
      jar.set(recoveryCookie, createRecoveryMarker(actor.id, actor.session), recoveryCookieOptions(origin));
      return finish('/redefinir-senha');
    }
    jar.set(recoveryCookie, '', { ...recoveryCookieOptions(origin), maxAge: 0 });
    // The SDK writes the validated session cookies before the redirect. The
    // destination can restore the account immediately without another login.
    return finish(returnTo);
  } catch { return finish(flow === 'recovery' ? '/redefinir-senha' : '/confirmar-email','invalido'); }
}
