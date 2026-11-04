import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, preferredLocale } from '@/i18n/config';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { deploymentOrigin } from '@/server/deployment-config';

export async function proxy(request: NextRequest) {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const hasSession = request.cookies.getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name));
  const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const authKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (hasSession && authUrl && authKey && !authKey.startsWith('sb_secret_')) {
    try {
      const auth = createServerClient(authUrl, authKey, {
        cookieOptions: { path: '/', sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' || new URL(deploymentOrigin(process.env, request.nextUrl.origin)).protocol === 'https:' },
        global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(8000) }) },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: values => values.forEach(value => { request.cookies.set(value.name, value.value); pending.push(value); }),
        },
      });
      await auth.auth.getUser();
    } catch { /* Private APIs independently verify identity and report dependency failures. */ }
  }
  const finish = (response: NextResponse) => {
    pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    if (hasSession || pending.length) {
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
      response.headers.set('Pragma', 'no-cache');
    }
    return response;
  };
  const path = request.nextUrl.pathname;
  const first = path.split('/')[1];
  // Internal rewrites may re-enter Proxy; an already resolved locale must not redirect again.
  if (!isLocale(first) && isLocale(request.headers.get('x-tf-locale'))) return finish(NextResponse.next({ request: { headers: request.headers } }));
  const saved = request.cookies.get('tf-locale')?.value;
  const locale = isLocale(first) ? first : isLocale(saved) ? saved : preferredLocale(request.headers.get('accept-language'));
  if (!isLocale(first)) { const url = request.nextUrl.clone(); url.pathname = `/${locale}${path === '/' ? '' : path}`; return finish(NextResponse.redirect(url)); }
  const url = request.nextUrl.clone(); url.pathname = path.slice(first.length + 1) || '/';
  const headers = new Headers(request.headers); headers.set('x-tf-locale', locale);
  const response = NextResponse.rewrite(url, { request: { headers } });
  response.cookies.set('tf-locale', locale, { path: '/', sameSite: 'lax', maxAge: 31536000 });
  return finish(response);
}
export const config = { matcher: ['/((?!api|_next|images|favicon|apple-touch-icon|robots.txt|sitemap.xml|.*\\..*).*)'] };
