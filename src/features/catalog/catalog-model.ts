import type { ProductDto } from '@/contracts/api';
import { products as knownProducts } from '@/domain/catalog';
import type { Locale } from '@/i18n/config';

export const catalogUnavailable = 'Não foi possível consultar o catálogo. Tente novamente.';
const slugs = new Set(knownProducts.map(product => product.slug));
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const imagePath = (value: unknown): value is string => typeof value === 'string' && /^\/images\/[a-z0-9/_.-]+$/i.test(value);

/** Validate the authority response before it can affect displayed prices or the cart. */
export function readCatalog(value: unknown): ProductDto[] {
  if (!value || typeof value !== 'object' || !('products' in value) || !Array.isArray(value.products) || value.products.length > 4) throw new Error(catalogUnavailable);
  const seen = new Set<string>();
  const orders = new Set<number>();
  const result = value.products.map((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') throw new Error(catalogUnavailable);
    const row = candidate as Record<string, unknown>;
    if (typeof row.slug !== 'string' || !slugs.has(row.slug as ProductDto['slug']) || seen.has(row.slug)
      || !nonempty(row.name) || !nonempty(row.flavorProfile) || !nonempty(row.description)
      || !positive(row.priceInCents) || !positive(row.volumeMl) || !positive(row.order) || orders.has(row.order)
      || typeof row.available !== 'boolean' || !imagePath(row.image) || !imagePath(row.canImage) || !imagePath(row.labelImage)
      || ![row.accent,row.background,row.ornament].every(color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color))) throw new Error(catalogUnavailable);
    seen.add(row.slug); orders.add(row.order);
    return { slug: row.slug, name: row.name, flavorProfile: row.flavorProfile, description: row.description,
      priceInCents: row.priceInCents, volumeMl: row.volumeMl, order: row.order, available: row.available,
      image: row.image, canImage: row.canImage, labelImage: row.labelImage, accent: row.accent, background: row.background, ornament: row.ornament } as ProductDto;
  });
  return result.sort((left,right) => left.order - right.order);
}

/** Language and marketing copy do not invalidate a monetary review. */
export function catalogRevision(products: readonly ProductDto[]): string {
  return JSON.stringify([...products].sort((left,right) => left.slug.localeCompare(right.slug))
    .map(({ slug, priceInCents, volumeMl, available }) => ({ slug, priceInCents, volumeMl, available })));
}

export async function fetchCatalog(locale: Locale, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ProductDto[]> {
  const response = await fetcher(`/api/products?locale=${encodeURIComponent(locale)}`, { credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) throw new Error(catalogUnavailable);
  return readCatalog(await response.json());
}
