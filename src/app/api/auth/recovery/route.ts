import { cookies } from 'next/headers';
import { apiRoute } from '@/server/http';
import { createAuthServerClient, recoveryCookie, recoveryIdentity, verifyRecoveryMarker } from '@/server/auth-session';
export const runtime = 'nodejs';
export const GET = apiRoute(async () => {
  const marker = (await cookies()).get(recoveryCookie)?.value;
  if (!marker) return Response.json({ allowed: false });
  const actor = await recoveryIdentity(await createAuthServerClient());
  return Response.json({ allowed: !!actor && verifyRecoveryMarker(marker, actor.id, actor.session) });
});
