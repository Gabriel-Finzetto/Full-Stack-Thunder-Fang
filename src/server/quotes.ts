import 'server-only';
import type { Country } from '@/domain/shipping';
import { checkoutMessages } from '@/i18n/checkout-messages';
import type { Locale } from '@/i18n/config';
import type { CheckoutInput, CheckoutQuoteDto, ItemInput, ItemTotals, ShippingQuoteDto } from '@/contracts/api';
import { findProduct, getCatalogRevision, loadCatalog, localCatalog, type ServerCatalog } from './catalog';
import { ApiError } from './errors';
import { signReview, verifyReview } from './review';

const maximum = BigInt(Number.MAX_SAFE_INTEGER);

function safeNumber(value: bigint): number {
  if (value < 0n || value > maximum) throw new ApiError(400, 'INVALID_INPUT', 'A quantidade excede a faixa numérica segura.', { items: ['Reduza a quantidade de latas.'] });
  return Number(value);
}

/** Recompute every amount from the server catalogue, including when called outside a route. */
export function calculateItems(items: readonly ItemInput[], locale: Locale = 'pt-BR', catalog?: ServerCatalog): ItemTotals {
  if (!Array.isArray(items) || !items.length) throw new ApiError(400, 'INVALID_INPUT', 'Escolha pelo menos um produto.', { items: ['Escolha pelo menos um produto.'] });
  const grouped = new Map<string, bigint>();
  for (const item of items) {
    if (!item || typeof item.slug !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new ApiError(400, 'INVALID_INPUT', 'Informe produtos e quantidades válidos.', { items: ['As quantidades devem ser inteiras e positivas.'] });
    }
    const previous = grouped.get(item.slug) ?? 0n;
    const next = previous + BigInt(item.quantity);
    safeNumber(next);
    grouped.set(item.slug, next);
  }
  let quantity = 0n;
  let subtotal = 0n;
  const lines = [...grouped].map(([slug, units]) => {
    const product = catalog ? catalog.products.find(candidate => candidate.slug === slug) : findProduct(slug, locale);
    if (!product?.available) throw new ApiError(409, 'PRODUCT_UNAVAILABLE', 'Um produto não está disponível. Confira sua seleção.', { items: ['Escolha produtos disponíveis no catálogo.'] });
    if (!Number.isSafeInteger(product.priceInCents) || product.priceInCents <= 0) throw new ApiError(500, 'INTERNAL_ERROR', 'Não foi possível calcular os produtos.');
    const amount = units * BigInt(product.priceInCents);
    safeNumber(amount);
    quantity += units;
    subtotal += amount;
    return { order: product.order, slug: product.slug, name: product.name, quantity: safeNumber(units), unitPriceInCents: product.priceInCents, lineTotalInCents: safeNumber(amount) };
  });
  // Sorting prevents a different request order or duplicate partition from changing the review.
  lines.sort((left, right) => left.order - right.order);
  safeNumber(quantity);
  safeNumber(subtotal);
  // Exact positive-integer equivalent of Math.round(subtotal / 10), without float precision loss.
  const discount = quantity >= 6n ? (subtotal + 5n) / 10n : 0n;
  return {
    items: lines.map(({ order: _order, ...line }) => line),
    quantity: safeNumber(quantity), subtotalInCents: safeNumber(subtotal),
    discountInCents: safeNumber(discount), productsTotalInCents: safeNumber(subtotal - discount),
  };
}

function findRegion(country: Country, region: string, catalog?: ServerCatalog) {
  if (!['BR', 'US', 'ES', 'CN'].includes(country)) throw new ApiError(400, 'INVALID_INPUT', 'Escolha um país de entrega válido.', { country: ['País de entrega não suportado.'] });
  const regions = (catalog ?? localCatalog()).regions;
  const found = typeof region === 'string' ? regions.find(candidate => candidate.country === country && candidate.code === region.trim()) : undefined;
  if (!found) throw new ApiError(400, 'INVALID_INPUT', 'Escolha uma região válida para o país.', { region: ['A região não pertence ao país informado.'] });
  return found;
}

export function quoteShipping(input: { items: readonly ItemInput[]; country: Country; region: string }, locale: Locale = 'pt-BR', catalog?: ServerCatalog): ShippingQuoteDto {
  const region = findRegion(input.country, input.region, catalog);
  const { quantity } = calculateItems(input.items, locale, catalog);
  const extra = quantity <= 6 ? 0 : quantity <= 12 ? 200 : quantity <= 24 ? 400 : 600;
  const standard = Math.min(2400, region.basePriceInCents + extra);
  const express = Math.min(3000, standard + 600);
  return {
    country: input.country, region: region.code, zone: region.zone, quantity, currency: 'BRL',
    options: [
      { method: 'standard', priceInCents: standard, businessDays: { ...region.standardDays } },
      { method: 'express', priceInCents: express, businessDays: { ...region.expressDays } },
    ],
  };
}

function translatedRegion(name: string, locale: Locale): string {
  if (locale === 'pt-BR') return name;
  return checkoutMessages[name]?.[locale === 'en' ? 0 : locale === 'es' ? 1 : 2] ?? name;
}

function checkoutBase(input: CheckoutInput, locale: Locale, catalog?: ServerCatalog): Omit<CheckoutQuoteDto, 'reviewToken' | 'reviewExpiresAt'> {
  const totals = calculateItems(input.items, locale, catalog);
  const shipping = quoteShipping({ items: input.items, country: input.delivery.country, region: input.delivery.region }, locale, catalog);
  const selected = shipping.options.find(option => option.method === input.method);
  if (!selected) throw new ApiError(400, 'INVALID_INPUT', 'Escolha uma modalidade de entrega válida.', { method: ['Modalidade inválida.'] });
  const region = findRegion(shipping.country, shipping.region, catalog);
  const referenceApplied = !input.delivery.street.trim();
  const resolvedAddress = referenceApplied ? region.referenceAddress : input.delivery.street;
  return {
    ...totals, currency: 'BRL', shippingInCents: selected.priceInCents,
    totalInCents: safeNumber(BigInt(totals.productsTotalInCents) + BigInt(selected.priceInCents)),
    delivery: {
      ...input.delivery, country: shipping.country, region: shipping.region,
      regionName: translatedRegion(region.name, locale), zone: shipping.zone,
      resolvedAddress, referenceApplied, method: selected.method,
      priceInCents: selected.priceInCents, businessDays: { ...selected.businessDays },
    },
  };
}

function reviewPayload(base: Omit<CheckoutQuoteDto, 'reviewToken' | 'reviewExpiresAt'>, catalog?: ServerCatalog) {
  const { regionName: _regionName, ...delivery } = base.delivery;
  return {
    catalogRevision: getCatalogRevision(catalog), currency: base.currency,
    items: base.items.map(({ name: _name, ...line }) => line),
    quantity: base.quantity, subtotalInCents: base.subtotalInCents, discountInCents: base.discountInCents,
    productsTotalInCents: base.productsTotalInCents, shippingInCents: base.shippingInCents, totalInCents: base.totalInCents,
    delivery,
  };
}

export function quoteCheckout(input: CheckoutInput, locale: Locale = 'pt-BR', catalog?: ServerCatalog): CheckoutQuoteDto {
  const base = checkoutBase(input, locale, catalog);
  return { ...base, ...signReview(reviewPayload(base, catalog)) };
}

export function assertCheckoutReview(input: CheckoutInput, reviewToken: string, locale: Locale = 'pt-BR', catalog?: ServerCatalog): CheckoutQuoteDto {
  const base = checkoutBase(input, locale, catalog);
  verifyReview(reviewToken, reviewPayload(base, catalog));
  // Return a fresh, signed quotation after checking the accepted contents; this does not deduplicate orders.
  return { ...base, ...signReview(reviewPayload(base, catalog)) };
}

/** Private order orchestration always refreshes the database before verifying an accepted review. */
export async function assertCurrentCheckoutReview(input: CheckoutInput, reviewToken: string, locale: Locale = 'pt-BR'): Promise<CheckoutQuoteDto> {
  return assertCheckoutReview(input, reviewToken, locale, await loadCatalog(locale));
}
