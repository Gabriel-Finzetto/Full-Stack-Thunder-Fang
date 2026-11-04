import type { DeliveryDraft } from './checkout-context';
import type { ShippingQuoteDto } from '@/contracts/api';
export type PostalAddressField = 'street'|'district'|'city'|'province';

/** Postal lookup is a suggestion: manually filled fields always take priority. */
export function mergePostalSuggestion(current: DeliveryDraft, postal: string, value: unknown, editedAfterLookup: readonly PostalAddressField[] = []): DeliveryDraft {
  if (current.country !== 'BR' || current.postal.replace(/\D/g,'') !== postal) return current;
  if (!value || typeof value !== 'object' || 'erro' in value && value.erro) throw new Error('CEP_NOT_FOUND');
  const row = value as Record<string, unknown>;
  const field = (key:string, limit:number) => typeof row[key] === 'string' ? (row[key] as string).trim().slice(0,limit) : '';
  const keep = (key:PostalAddressField) => editedAfterLookup.includes(key) || !!current[key].trim();
  return { ...current, street:keep('street') ? current.street : field('logradouro',300), district:keep('district') ? current.district : field('bairro',160),
    city:keep('city') ? current.city : field('localidade',160), province:keep('province') ? current.province : field('uf',160) };
}

/** Keep the visitor's explicit choice only while that method remains offered. */
export function preserveShippingMethod(method: DeliveryDraft['method'], options: ShippingQuoteDto['options']): DeliveryDraft['method'] {
  return options.some(option => option.method === method) ? method : '';
}
