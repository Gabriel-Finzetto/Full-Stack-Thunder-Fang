import type { Product, ProductSlug } from '@/domain/catalog';
import type { Country, ShippingMethod } from '@/domain/shipping';

export type ProductDto = Product & { available: boolean; order: number; canImage: string; labelImage: string };
export type ItemInput = { slug: ProductSlug; quantity: number };
export type DeliveryInput = {
  country: Country; region: string; postal: string; street: string; number: string;
  noNumber: boolean; complement: string; district: string; city: string; province: string;
  reference: string; instructions: string;
};
export type ZoneCode = 'BR' | 'NA' | 'EU' | 'AS';
export type BusinessDays = { min: number | null; max: number };
export type ShippingOptionDto = { method: ShippingMethod; priceInCents: number; businessDays: BusinessDays };
export type ShippingQuoteDto = { country: Country; region: string; zone: ZoneCode; quantity: number; currency: 'BRL'; options: ShippingOptionDto[] };
export type ResolvedDeliveryDto = DeliveryInput & {
  regionName: string; zone: ZoneCode; resolvedAddress: string; referenceApplied: boolean;
  method: ShippingMethod; priceInCents: number; businessDays: BusinessDays;
};
export type QuoteItemDto = { slug: ProductSlug; name: string; quantity: number; unitPriceInCents: number; lineTotalInCents: number };
export type ItemTotals = { items: QuoteItemDto[]; quantity: number; subtotalInCents: number; discountInCents: number; productsTotalInCents: number };
export type CheckoutInput = { items: ItemInput[]; delivery: DeliveryInput; method: ShippingMethod };
export type CreateOrderInput = CheckoutInput & { reviewToken: string };
export type CheckoutQuoteDto = ItemTotals & {
  currency: 'BRL'; shippingInCents: number; totalInCents: number; delivery: ResolvedDeliveryDto;
  reviewToken: string; reviewExpiresAt: string;
};
export type OrderDto = Omit<CheckoutQuoteDto, 'reviewToken' | 'reviewExpiresAt'> & {
  id: string; number: string; ownerId: string; status: 'simulation_completed'; createdAt: string; expiresAt: string;
};
export type DefaultDelivery = { delivery: DeliveryInput; method: ShippingMethod };
export type ProfileUpdate = { name: string; defaultDelivery?: DefaultDelivery | null };
export type ProfileDto = { id: string; name: string; email: string; defaultDelivery?: DefaultDelivery | null };
export type AuthActor = { id: string; email: string };
export type OrderPage = { orders: OrderDto[]; nextCursor: string | null };
export type ContactInput = { name: string; email: string; reason: 'products' | 'order' | 'partnerships' | 'other'; message: string };
