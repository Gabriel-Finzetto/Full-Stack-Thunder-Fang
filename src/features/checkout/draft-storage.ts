import { CART_LIFETIME } from '@/domain/commerce';
import type { DeliveryDraft } from './checkout-context';

export const CHECKOUT_DRAFT_KEY = 'tf-checkout-draft-v1';
export const CHECKOUT_DRAFT_LIFETIME = CART_LIFETIME;
type StoredDraft = { version: 1; ownerId: string | null; cartGeneration: string; savedAt: number; expiresAt: number; draft: DeliveryDraft; step: number };
type DraftScope = { ownerId: string | null; cartGeneration: string; now?: number };
const fields = { region:160, postal:160, street:300, number:160, complement:160, district:160, city:160, province:160, reference:300, instructions:500 } as const;
const identity = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only short-lived delivery fields are stored: never auth, review tokens or orders. */
export function serializeCheckoutDraft(draft: DeliveryDraft, step: number, scope: DraftScope): string | null {
  const now = scope.now ?? Date.now();
  if (!scope.cartGeneration || !Object.keys(fields).some(key => String(draft[key as keyof typeof fields]).trim())) return null;
  const value: StoredDraft = { version:1, ownerId:scope.ownerId, cartGeneration:scope.cartGeneration, savedAt:now, expiresAt:now + CHECKOUT_DRAFT_LIFETIME,
    draft:{ country:draft.country, region:draft.region, postal:draft.postal, street:draft.street, number:draft.number, noNumber:draft.noNumber, complement:draft.complement, district:draft.district, city:draft.city, province:draft.province, reference:draft.reference, instructions:draft.instructions, method:draft.method },
    step:Math.max(0, Math.min(2, Math.floor(step))) };
  const encoded = JSON.stringify(value);
  return restoreCheckoutDraft(encoded, { ...scope, now }) ? encoded : null;
}

/** The server-verified current owner and live cart must match before restoring. */
export function restoreCheckoutDraft(raw: string | null, scope: DraftScope): Pick<StoredDraft,'draft'|'step'|'expiresAt'> | null {
  if (!raw || raw.length > 8000 || !scope.cartGeneration || scope.ownerId !== null && !identity.test(scope.ownerId)) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>, now = scope.now ?? Date.now();
    const ownerMatches = row.ownerId === scope.ownerId || row.ownerId === null && scope.ownerId !== null;
    if (row.version !== 1 || !ownerMatches || row.cartGeneration !== scope.cartGeneration
      || row.ownerId !== null && (typeof row.ownerId !== 'string' || !identity.test(row.ownerId))
      || typeof row.savedAt !== 'number' || !Number.isFinite(row.savedAt) || row.savedAt > now
      || typeof row.expiresAt !== 'number' || !Number.isFinite(row.expiresAt) || row.expiresAt <= now
      || row.expiresAt - row.savedAt > CHECKOUT_DRAFT_LIFETIME || row.expiresAt <= row.savedAt
      || !Number.isInteger(row.step) || Number(row.step) < 0 || Number(row.step) > 2 || !row.draft || typeof row.draft !== 'object') return null;
    const draft = row.draft as Record<string, unknown>;
    if (typeof draft.country !== 'string' || !['BR','US','ES','CN'].includes(draft.country) || typeof draft.noNumber !== 'boolean'
      || typeof draft.method !== 'string' || !['','standard','express'].includes(draft.method)) return null;
    for (const [key, limit] of Object.entries(fields)) if (typeof draft[key] !== 'string' || (draft[key] as string).length > limit) return null;
    // Rebuild the allowed shape, dropping unknown data even from altered storage.
    const clean = Object.fromEntries(Object.keys(fields).map(key => [key,draft[key]]));
    return { draft:{ ...clean, country:draft.country, noNumber:draft.noNumber, method:draft.method } as DeliveryDraft, step:Number(row.step), expiresAt:row.expiresAt };
  } catch { return null; }
}
