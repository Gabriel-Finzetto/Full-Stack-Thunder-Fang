import { describe, expect, it } from 'vitest';
import { clearsCheckoutDraft, identityChange } from '../src/features/account/identity-transition';
import { CHECKOUT_DRAFT_LIFETIME, restoreCheckoutDraft, serializeCheckoutDraft } from '../src/features/checkout/draft-storage';
import type { DeliveryDraft } from '../src/features/checkout/checkout-context';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const actors = [null, A, B] as const;
const now = Date.parse('2026-11-03T12:00:00Z');
const draft: DeliveryDraft = { country:'BR',region:'SP-CAPITAL',postal:'01001-000',street:'Rua de teste privada',number:'',noNumber:true,complement:'',district:'',city:'',province:'',reference:'',instructions:'',method:'standard' };

describe('propriedades de privacidade nos estados do cliente', () => {
  it('restaura um rascunho privado somente para o mesmo proprietário, carrinho e validade', () => {
    for (const ownerId of actors) {
      const encoded = serializeCheckoutDraft(draft, 1, { ownerId, cartGeneration:'cart-a', now });
      expect(encoded).not.toBeNull();
      for (const recipient of actors) for (const cartGeneration of ['cart-a','cart-b']) {
        const result = restoreCheckoutDraft(encoded, { ownerId:recipient, cartGeneration, now });
        // Anonymous checkout is intentionally adopted at first login. A private
        // draft is never transferable to an anonymous or different signed-in tab.
        const mayRestore = cartGeneration === 'cart-a' && (ownerId === null || ownerId === recipient);
        expect(Boolean(result)).toBe(mayRestore);
        if (result) expect(result.draft).toEqual(draft);
      }
      for (const elapsed of [CHECKOUT_DRAFT_LIFETIME, CHECKOUT_DRAFT_LIFETIME + 1, CHECKOUT_DRAFT_LIFETIME * 100]) {
        expect(restoreCheckoutDraft(encoded, { ownerId, cartGeneration:'cart-a', now:now + elapsed })).toBeNull();
      }
    }
  });

  it('não serializa credenciais, pedidos, revisão nem campos extras introduzidos no objeto', () => {
    const marker = 'must-never-persist-private-token';
    const poisoned = { ...draft, access_token:marker, refresh_token:marker, order:{address:marker}, reviewToken:marker, ownerId:B, totalInCents:1 };
    const encoded = serializeCheckoutDraft(poisoned, 2, { ownerId:A, cartGeneration:'cart-a', now });
    expect(encoded).not.toContain(marker);
    expect(JSON.parse(encoded!).ownerId).toBe(A);
    const restored = restoreCheckoutDraft(encoded, { ownerId:A, cartGeneration:'cart-a', now });
    expect(restored?.draft).toEqual(draft);
    expect(Object.keys(restored!.draft).sort()).toEqual(Object.keys(draft).sort());
  });

  it('recusa metadados adulterados em vez de prolongar a exposição de dados', () => {
    const encoded = serializeCheckoutDraft(draft, 1, { ownerId:A, cartGeneration:'cart-a', now })!;
    const row = JSON.parse(encoded);
    for (const change of [
      { ownerId:B }, { ownerId:'not-an-id' }, { cartGeneration:'other' },
      { savedAt:now + 1 }, { expiresAt:now }, { expiresAt:now + CHECKOUT_DRAFT_LIFETIME + 1 },
      { step:-1 }, { step:3 }, { draft:{...draft,street:12} },
    ]) expect(restoreCheckoutDraft(JSON.stringify({...row,...change}), { ownerId:A, cartGeneration:'cart-a', now })).toBeNull();
  });

  it('repetir observações de sessão não altera o descarte de dados em 1092 sequências de até seis estados', () => {
    const signals = (trace:readonly (string|null)[]) => {
      let previous:string|null|undefined;
      const result = [];
      for (const next of trace) {
        const signal = identityChange(previous,next);
        if (clearsCheckoutDraft(signal)) result.push(signal);
        previous = next;
      }
      return result;
    };
    let count = 0;
    const visit = (trace:readonly (string|null)[]) => {
      if (trace.length) {
        count++;
        // Metamorphic property: token refresh/focus duplicates must never clear
        // a same-owner draft or hide a real transition to another identity.
        const duplicated = trace.flatMap(actor => [actor,actor]);
        expect(signals(duplicated)).toEqual(signals(trace));
      }
      if (trace.length < 6) for (const actor of actors) visit([...trace,actor]);
    };
    visit([]);
    expect(count).toBe(1092);
    expect(signals([A,null,A])).toHaveLength(1);
    expect(signals([A,B,A])).toHaveLength(2);
  });
});
