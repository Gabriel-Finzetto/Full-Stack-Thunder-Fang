import type { DefaultDelivery } from '@/contracts/api';
import type { DeliveryDraft } from './checkout-context';

/** Preserve a visitor's in-progress address, including one entered before login. */
export function preferSavedDelivery(draft: DeliveryDraft, saved?: DefaultDelivery | null): DeliveryDraft {
  if (!saved || draft.country !== 'BR' || Object.entries(draft).some(([key, value]) => key !== 'country' && key !== 'noNumber' && typeof value === 'string' && value.trim()) || draft.noNumber) return draft;
  return { ...saved.delivery, method: saved.method };
}
