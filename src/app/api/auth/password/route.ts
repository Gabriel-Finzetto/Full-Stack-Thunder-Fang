import { cookies } from 'next/headers';
import { z } from 'zod';
import { apiRoute, readJson } from '@/server/http';
import { ApiError } from '@/server/errors';
import { enforceRateLimit } from '@/server/rate-limit';
import { authErrorMessage } from '@/features/account/auth-navigation';
import { authOrigin, createAuthServerClient, recoveryCookie, recoveryCookieOptions, recoveryIdentity, verifyRecoveryMarker } from '@/server/auth-session';

export const runtime = 'nodejs';
const passwordInput = z.strictObject({ password: z.string().min(8).max(256), confirmation: z.string().min(8).max(256) }).refine(value => value.password === value.confirmation, { path: ['confirmation'], message: 'As senhas precisam ser iguais.' });
export const POST = apiRoute(async request => {
  const input = await readJson(request, passwordInput);
  await enforceRateLimit(request, 'private');
  const origin = authOrigin(request);
  const jar = await cookies();
  const client = await createAuthServerClient();
  const actor = await recoveryIdentity(client);
  if (!actor || !verifyRecoveryMarker(jar.get(recoveryCookie)?.value, actor.id, actor.session)) throw new ApiError(401, 'RECOVERY_REQUIRED', 'Este link é inválido ou expirou. Solicite outro link.');
  const { error } = await client.auth.updateUser({ password: input.password });
  if (error) throw new ApiError(error.status === 429 ? 429 : error.status && error.status < 500 ? 400 : 503, 'PASSWORD_UPDATE_FAILED', authErrorMessage(error));
  jar.set(recoveryCookie, '', { ...recoveryCookieOptions(origin), maxAge: 0 });
  // A successful password change is reported even if the separate session-revocation service fails.
  let sessionEnded = false;
  try { sessionEnded = !(await client.auth.signOut({ scope: 'global' })).error; }
  catch { /* The password update was already committed; do not report it as failed. */ }
  return Response.json({ updated: true, sessionEnded });
}, { mutation: true });
