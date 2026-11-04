import 'server-only';
import { createHash } from 'node:crypto';
import { products } from '@/domain/catalog';
import { catalogMessages } from '@/i18n/catalog-messages';
import type { Locale } from '@/i18n/config';
import type { ProductDto } from '@/contracts/api';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { brazilRegions, countryShipping, type Country } from '@/domain/shipping';
import { internationalRegions } from '@/domain/regions';
import { isLocalBackend } from './config';
import { ApiError } from './errors';

export type DeliveryRegion = {
  country: Country; code: string; name: string; zone: 'BR' | 'NA' | 'EU' | 'AS'; basePriceInCents: number;
  standardDays: { min: number | null; max: number }; expressDays: { min: number | null; max: number }; referenceAddress: string;
};
export type ServerCatalog = { products: ProductDto[]; regions: DeliveryRegion[] };

function translate(text: string, locale: Locale): string {
  if (locale === 'pt-BR') return text;
  const index = locale === 'en' ? 0 : locale === 'es' ? 1 : 2;
  return catalogMessages[text]?.[index] ?? text;
}

/** Versioned source for explicit local development and pure calculation tests. */
export function listProducts(locale: Locale = 'pt-BR'): ProductDto[] {
  return products.map((product, index) => ({
    ...product,
    name: translate(product.name, locale),
    flavorProfile: translate(product.flavorProfile, locale),
    description: translate(product.description, locale),
    available: true,
    order: index + 1,
    canImage: `/images/cans/${product.slug}.png`,
    labelImage: `/images/labels/${product.slug}.png`,
  }));
}

export function findProduct(slug: string, locale: Locale = 'pt-BR'): ProductDto | undefined {
  return listProducts(locale).find(product => product.slug === slug);
}

/** Only purchase-relevant fields invalidate a monetary review; interface language does not. */
export function getCatalogRevision(catalog?: ServerCatalog): string {
  const revision = (catalog?.products ?? listProducts()).map(({ slug, priceInCents, volumeMl, available }) => ({ slug, priceInCents, volumeMl, available }));
  return createHash('sha256').update(JSON.stringify(revision)).digest('hex');
}

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const dayRange = z.object({ min: z.number().int().nonnegative().nullable(), max: positive }).refine(value => value.min === null || value.min <= value.max);
const text = z.string().trim().min(1);
const translation = z.object({ locale: z.enum(['pt-BR', 'en', 'es', 'zh-Hans']), name: text, flavor_profile: text, description: text });
const productRow = z.object({
  slug: z.enum(['original', 'citricos', 'tropicais', 'frutas-vermelhas']), name: text, flavor_profile: text, description: text,
  price_in_cents: positive, volume_ml: positive, image: z.string().startsWith('/images/'),
  accent: z.string().regex(/^#[\da-f]{6}$/i), background: z.string().regex(/^#[\da-f]{6}$/i), ornament: z.string().regex(/^#[\da-f]{6}$/i),
  available: z.boolean(), sort_order: positive, translations: z.array(translation),
});
const regionRow = z.object({
  country: z.enum(['BR', 'US', 'ES', 'CN']), code: text, name: text, zone: z.enum(['BR', 'NA', 'EU', 'AS']),
  base_price_in_cents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  standard_min: z.number().int().nonnegative().nullable(), standard_max: positive,
  express_min: z.number().int().nonnegative().nullable(), express_max: positive, reference_address: text,
});
const unavailable = () => new ApiError(503, 'SERVICE_UNAVAILABLE', 'O catálogo e as entregas estão temporariamente indisponíveis.');
const zoneCodes = { BR: 'BR', US: 'NA', ES: 'EU', CN: 'AS' } as const;
const localDays = {
  BR: { standard: { min: null, max: 7 }, express: { min: 2, max: 3 } },
  US: { standard: { min: 10, max: 16 }, express: { min: 5, max: 8 } },
  ES: { standard: { min: 10, max: 18 }, express: { min: 5, max: 9 } },
  CN: { standard: { min: 12, max: 25 }, express: { min: 6, max: 12 } },
};

export function localCatalog(locale: Locale = 'pt-BR'): ServerCatalog {
  const regions = (Object.keys(countryShipping) as Country[]).flatMap(country => {
    const entries = country === 'BR' ? brazilRegions : internationalRegions[country];
    return entries.map(region => ({
      country, code: region.code, name: region.name, zone: zoneCodes[country],
      basePriceInCents: 'base' in region ? region.base as number : countryShipping[country].base,
      standardDays: { ...localDays[country].standard }, expressDays: { ...localDays[country].express }, referenceAddress: countryShipping[country].reference,
    }));
  });
  return { products: listProducts(locale), regions };
}

/** Each production request reads a fresh authority snapshot; database failure never uses local prices. */
export async function loadCatalog(locale: Locale = 'pt-BR'): Promise<ServerCatalog> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url && !key && isLocalBackend()) return localCatalog(locale);
  if (!url || !key || key.startsWith('sb_secret_') || key.length > 4096 || /\s/.test(key)) throw unavailable();
  try {
    const destination = new URL(url);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname);
    if ((destination.protocol !== 'https:' && !(loopback && destination.protocol === 'http:')) || destination.username || destination.password || destination.search || destination.hash) throw unavailable();
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, init) => {
        const parent = init?.signal;
        const signal = parent ? AbortSignal.any([parent, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
        const headers = new Headers(init?.headers);
        if (key.startsWith('sb_publishable_') && headers.get('authorization') === `Bearer ${key}`) headers.delete('authorization');
        return fetch(input, { ...init, headers, signal, cache: 'no-store' });
      } },
    });
    const [productResult, regionResult] = await Promise.all([
      client.from('products').select('slug,name,flavor_profile,description,price_in_cents,volume_ml,image,accent,background,ornament,available,sort_order,translations:product_translations(locale,name,flavor_profile,description)').eq('available', true).order('sort_order'),
      client.from('delivery_regions').select('country,code,name,zone,base_price_in_cents,standard_min,standard_max,express_min,express_max,reference_address').order('country').order('code'),
    ]);
    if (productResult.error || regionResult.error) throw unavailable();
    const parsedProducts = z.array(productRow).max(4).parse(productResult.data);
    const parsedRegions = z.array(regionRow).min(1).parse(regionResult.data);
    const seen = new Set<string>();
    const mappedProducts: ProductDto[] = parsedProducts.map(row => {
      if (seen.has(row.slug) || new Set(row.translations.map(entry => entry.locale)).size !== row.translations.length) throw unavailable();
      seen.add(row.slug);
      const localized = row.translations.find(entry => entry.locale === locale);
      if (!localized) throw unavailable();
      return {
        slug: row.slug, name: localized.name, flavorProfile: localized.flavor_profile, description: localized.description,
        priceInCents: row.price_in_cents, volumeMl: row.volume_ml, image: row.image,
        accent: row.accent, background: row.background, ornament: row.ornament, available: row.available, order: row.sort_order,
        canImage: `/images/cans/${row.slug}.png`, labelImage: `/images/labels/${row.slug}.png`,
      };
    });
    const regionKeys = new Set<string>();
    const regions: DeliveryRegion[] = parsedRegions.map(row => {
      const id = `${row.country}:${row.code}`;
      if (regionKeys.has(id) || row.zone !== zoneCodes[row.country]) throw unavailable();
      regionKeys.add(id);
      return {
        country: row.country, code: row.code, name: row.name, zone: row.zone, basePriceInCents: row.base_price_in_cents,
        standardDays: dayRange.parse({ min: row.standard_min, max: row.standard_max }),
        expressDays: dayRange.parse({ min: row.express_min, max: row.express_max }), referenceAddress: row.reference_address,
      };
    });
    return { products: mappedProducts, regions };
  } catch { throw unavailable(); }
}
