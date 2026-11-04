import { describe, expect, it } from 'vitest';
import { clearsCheckoutDraft, identityChange } from '../src/features/account/identity-transition';

const first = '5aa173b8-3d01-4f7f-9e07-8ae257873530';
const second = 'b3cefcac-a825-4cad-b5d8-a58deca205c3';

describe('checkout and account identity transitions', () => {
  it('binds the initial anonymous or SSR-restored identity without discarding a new tab draft', () => {
    expect(identityChange(undefined, null)).toBeNull();
    expect(identityChange(undefined, first)).toBeNull();
  });

  it('preserves anonymous purchase details while authenticating in the same or another tab', () => {
    expect(clearsCheckoutDraft(identityChange(null, first))).toBe(false);
  });

  it('preserves delivery after a same-account token refresh or focus revalidation', () => {
    expect(identityChange(first, first)).toBeNull();
    expect(clearsCheckoutDraft(identityChange(first, first))).toBe(false);
  });

  it('discards address, shipping and review on logout or a server-confirmed expired session', () => {
    expect(clearsCheckoutDraft(identityChange(first, null))).toBe(true);
    expect(identityChange(null, null)).toBeNull();
  });

  it('discards the previous account draft when another account signs in, including cross-tab notifications', () => {
    expect(clearsCheckoutDraft(identityChange(first, second))).toBe(true);
  });

  it('retains the owner baseline across display-cache invalidation so the next transition stays private', () => {
    // Refresh clears display state, not this independent last-observed identity.
    const baseline = first;
    expect(clearsCheckoutDraft(identityChange(baseline, baseline))).toBe(false);
    expect(clearsCheckoutDraft(identityChange(baseline, second))).toBe(true);
    expect(clearsCheckoutDraft(identityChange(baseline, null))).toBe(true);
  });

  it('ignores absent or malformed signals rather than treating any auth activity as logout', () => {
    for (const value of [null, undefined, {}, { previousUserId: first }, { previousUserId: first, nextUserId: 12 }, { previousUserId: '', nextUserId: null }]) {
      expect(clearsCheckoutDraft(value)).toBe(false);
    }
  });
});
