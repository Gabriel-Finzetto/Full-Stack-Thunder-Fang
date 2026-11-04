type Environment = Record<string, string | undefined>;

function configurationError(variable: string): never {
  throw new Error(`Invalid deployment configuration: ${variable}.`);
}

function origin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { return configurationError('site origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) return configurationError('site origin');
  return url.origin;
}

function vercelOrigin(host: string | undefined, variable: string): string {
  // The value comes from Vercel's deployment configuration, never from a request.
  // Only the exact deployment/branch hosts are trusted, not the vercel.app suffix.
  if (!host || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/i.test(host)) return configurationError(variable);
  return `https://${host.toLowerCase()}`;
}

export function deploymentOrigins(env: Environment = process.env, fallback = 'http://127.0.0.1:3000'): string[] {
  if (env.VERCEL === '1' && env.VERCEL_ENV === 'preview') {
    const current = vercelOrigin(env.VERCEL_URL, 'VERCEL_URL');
    const branch = env.VERCEL_BRANCH_URL ? vercelOrigin(env.VERCEL_BRANCH_URL, 'VERCEL_BRANCH_URL') : null;
    return Array.from(new Set(branch ? [current, branch] : [current]));
  }
  const configured = origin(env.NEXT_PUBLIC_SITE_URL || fallback);
  if (env.VERCEL === '1' && env.VERCEL_ENV === 'production') {
    const site = new URL(configured);
    if (site.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(site.hostname)) return configurationError('NEXT_PUBLIC_SITE_URL');
  }
  return [configured];
}

export function deploymentOrigin(env: Environment = process.env, fallback?: string): string {
  return deploymentOrigins(env, fallback)[0];
}

export function trustedRequestOrigin(request: Request, localAliases = false, fallback?: string): string | null {
  const allowed = deploymentOrigins(process.env, fallback);
  const configured = new URL(allowed[0]);
  const host = request.headers.get('host');
  let external: URL;
  try {
    if (host !== null) {
      if (!/^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::[0-9]{1,5})?$/i.test(host)) return null;
      external = new URL(`${configured.protocol}//${host}`);
      if (external.host.toLowerCase() !== host.toLowerCase()) return null;
    } else external = new URL(request.url);
  } catch { return null; }
  if (allowed.includes(external.origin)) return external.origin;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(external.hostname);
  if (localAliases && process.env.VERCEL !== '1' && loopback
    && external.protocol === configured.protocol && external.port === configured.port) return external.origin;
  return null;
}

/** Hosted builds must bind Preview and Production to distinct Supabase projects. */
export function assertHostedDeployment(env: Environment = process.env): void {
  if (env.VERCEL !== '1' || env.VERCEL_ENV === 'development') return;
  if (!['production', 'preview'].includes(env.VERCEL_ENV ?? '')) return configurationError('VERCEL_ENV');
  if (env.BACKEND_LOCAL_MODE !== 'false') return configurationError('BACKEND_LOCAL_MODE');
  const production = env.SUPABASE_PRODUCTION_PROJECT_REF;
  const preview = env.SUPABASE_PREVIEW_PROJECT_REF;
  if (!production || !/^[a-z]{20}$/.test(production)) return configurationError('SUPABASE_PRODUCTION_PROJECT_REF');
  if (!preview || !/^[a-z]{20}$/.test(preview) || preview === production) return configurationError('SUPABASE_PREVIEW_PROJECT_REF');
  const expected = env.VERCEL_ENV === 'production' ? production : preview;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || origin(env.NEXT_PUBLIC_SUPABASE_URL) !== `https://${expected}.supabase.co`) return configurationError('NEXT_PUBLIC_SUPABASE_URL');
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_')) return configurationError('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.startsWith('sb_publishable_')) return configurationError('SUPABASE_SECRET_KEY');
  if (!env.BACKEND_REVIEW_SECRET || Buffer.byteLength(env.BACKEND_REVIEW_SECRET, 'utf8') < 32) return configurationError('BACKEND_REVIEW_SECRET');
  deploymentOrigins(env);
}
