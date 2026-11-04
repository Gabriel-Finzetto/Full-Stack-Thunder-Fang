import { describe, expect, it } from 'vitest';
import { beginConfirmation, canContinueConfirmation, confirmationIsActive, confirmationWaitLifetime } from '../src/features/account/pending-confirmation';

const expected = '00000000-0000-4000-8000-000000000001';
const previous = '00000000-0000-4000-8000-000000000002';
const now = 1793278800000;

describe('registration waiting for a server-verified account', () => {
  it('only continues when the verified profile belongs to the registration being confirmed', () => {
    const pending = beginConfirmation(expected, now);
    expect(canContinueConfirmation(pending, expected, now)).toBe(true);
    expect(canContinueConfirmation(pending, previous, now)).toBe(false);
    expect(canContinueConfirmation(pending, null, now)).toBe(false);
    expect(canContinueConfirmation(pending, undefined, now)).toBe(false);
  });

  it('does not continue an unrelated signed-in account or a page opened without a registration attempt', () => {
    expect(canContinueConfirmation(null, previous, now)).toBe(false);
    for (const id of [undefined, null, '', 'fake', { id: expected }]) expect(beginConfirmation(id, now)).toBeNull();
  });

  it('expires the correlation hint rather than following a much later login', () => {
    const pending = beginConfirmation(expected, now);
    expect(confirmationIsActive(pending, now + confirmationWaitLifetime - 1)).toBe(true);
    expect(canContinueConfirmation(pending, expected, now + confirmationWaitLifetime)).toBe(false);
    expect(canContinueConfirmation(pending, expected, now - 1)).toBe(false);
  });
});
