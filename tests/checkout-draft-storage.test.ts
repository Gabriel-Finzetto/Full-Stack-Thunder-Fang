import { describe, expect, it } from 'vitest';
import { emptyDelivery } from '../src/features/checkout/checkout-context';
import { CHECKOUT_DRAFT_LIFETIME, restoreCheckoutDraft, serializeCheckoutDraft } from '../src/features/checkout/draft-storage';

const owner = '00000000-0000-4000-8000-000000000001';
const another = '00000000-0000-4000-8000-000000000002';
const now = Date.parse('2026-11-02T12:00:00Z');
const scope = { ownerId:owner, cartGeneration:'cart-generation', now };
const draft = { ...emptyDelivery(), region:'SP-CAPITAL', street:'Rua de demonstração', method:'express' as const };

describe('short-lived delivery draft, scoped to the verified account and cart', () => {
  it('restores delivery and progress, never a previously accepted review', () => {
    const saved = serializeCheckoutDraft(draft, 3, scope)!;
    expect(restoreCheckoutDraft(saved, scope)).toEqual({ draft, step:2, expiresAt:now+CHECKOUT_DRAFT_LIFETIME });
    expect(JSON.parse(saved)).not.toHaveProperty('reviewToken');
    expect(JSON.parse(saved)).not.toHaveProperty('receipt');
    expect(JSON.parse(saved)).not.toHaveProperty('session');
  });
  it('preserves anonymous delivery when the same tab signs in, without sharing an owned draft', () => {
    const anonymous = serializeCheckoutDraft(draft, 2, { ...scope, ownerId:null })!;
    expect(restoreCheckoutDraft(anonymous, scope)?.draft).toEqual(draft);
    const signed = serializeCheckoutDraft(draft, 2, scope)!;
    expect(restoreCheckoutDraft(signed, { ...scope, ownerId:null })).toBeNull();
    expect(restoreCheckoutDraft(signed, { ...scope, ownerId:another })).toBeNull();
  });
  it('rejects expiry, clock rollback and a replaced or expired cart', () => {
    const saved = serializeCheckoutDraft(draft, 1, scope)!;
    expect(restoreCheckoutDraft(saved, { ...scope, now:now+CHECKOUT_DRAFT_LIFETIME })).toBeNull();
    expect(restoreCheckoutDraft(saved, { ...scope, now:now-1 })).toBeNull();
    expect(restoreCheckoutDraft(saved, { ...scope, cartGeneration:'another-cart' })).toBeNull();
    const extended = JSON.parse(saved); extended.expiresAt += 1;
    expect(restoreCheckoutDraft(JSON.stringify(extended), scope)).toBeNull();
  });
  it('drops unknown injected fields and refuses malformed, oversized or invalid data', () => {
    expect(restoreCheckoutDraft('not-json', scope)).toBeNull();
    expect(restoreCheckoutDraft('x'.repeat(8001), scope)).toBeNull();
    const saved = JSON.parse(serializeCheckoutDraft(draft, 1, scope)!);
    saved.draft.password = 'not-part-of-the-draft'; saved.session = 'not-part-of-the-draft';
    expect(restoreCheckoutDraft(JSON.stringify(saved), scope)?.draft).not.toHaveProperty('password');
    saved.draft.street = 'x'.repeat(301);
    expect(restoreCheckoutDraft(JSON.stringify(saved), scope)).toBeNull();
    saved.draft.street = ''; saved.draft.country = 'XX';
    expect(restoreCheckoutDraft(JSON.stringify(saved), scope)).toBeNull();
    saved.draft.country = ['BR'];
    expect(restoreCheckoutDraft(JSON.stringify(saved), scope)).toBeNull();
    saved.draft.country = 'BR'; saved.draft.method = ['express'];
    expect(restoreCheckoutDraft(JSON.stringify(saved), scope)).toBeNull();
    expect(serializeCheckoutDraft(emptyDelivery(), 0, scope)).toBeNull();
  });
});
