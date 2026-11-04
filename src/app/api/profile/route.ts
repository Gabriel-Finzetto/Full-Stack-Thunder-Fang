import { apiRoute, readJson } from '@/server/http';
import { profileSchema } from '@/server/schemas';
import { privateServices } from '@/server/private-route';
export const runtime = 'nodejs';
export const GET = apiRoute(async request => Response.json({ profile: await (await privateServices(request)).getProfile() }));
export const PATCH = apiRoute(async request => {
  const input = await readJson(request, profileSchema);
  return Response.json({ profile: await (await privateServices(request)).updateProfile(input.name, request.headers.get('x-tf-account') ?? undefined, input.defaultDelivery) });
}, { mutation: true });
