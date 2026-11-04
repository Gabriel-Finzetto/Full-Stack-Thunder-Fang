import 'server-only';
import { getPrivateServices } from './private-services';
import { enforceRateLimit } from './rate-limit';

export async function privateServices(request: Request) {
  // An arbitrary Bearer/cookie must not let anonymous traffic drain the private
  // quota. Constructing these services authenticates first; no private data is read yet.
  const services = await getPrivateServices(request);
  await enforceRateLimit(request, 'private');
  return services;
}
