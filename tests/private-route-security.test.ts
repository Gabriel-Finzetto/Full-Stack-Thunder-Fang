import { afterEach, describe, expect, it, vi } from 'vitest';
import { privateServices } from '../src/server/private-route';
import { getPrivateServices } from '../src/server/private-services';
import { enforceRateLimit } from '../src/server/rate-limit';
import { ApiError } from '../src/server/errors';

vi.mock('../src/server/private-services', () => ({ getPrivateServices: vi.fn() }));
vi.mock('../src/server/rate-limit', () => ({ enforceRateLimit: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe('private route abuse boundaries', () => {
  const invalidCredentials: Record<string, string>[] = [
    {},
    { authorization: 'Bearer attacker-controlled-invalid-token' },
    { cookie: 'sb-example-auth-token=invalid-session' },
  ];
  it.each(invalidCredentials)('invalid sessions cannot consume the shared private quota: %j', async headers => {
    vi.mocked(getPrivateServices).mockRejectedValue(new ApiError(401, 'AUTH_REQUIRED', 'Authentication required'));
    await expect(privateServices(new Request('https://store.example/api/profile', { headers }))).rejects.toMatchObject({ status: 401 });
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it('authenticated requests still fail closed when the quota service fails', async () => {
    const services = { getProfile: vi.fn() } as unknown as Awaited<ReturnType<typeof getPrivateServices>>;
    vi.mocked(getPrivateServices).mockResolvedValue(services);
    vi.mocked(enforceRateLimit).mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unavailable'));
    await expect(privateServices(new Request('https://store.example/api/profile', { headers: { authorization: 'Bearer valid' } }))).rejects.toMatchObject({ status: 503 });
    expect(services.getProfile).not.toHaveBeenCalled();
  });
});
