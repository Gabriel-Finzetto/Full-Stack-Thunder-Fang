import { apiRoute, readJson } from '@/server/http';
import { quoteShipping } from '@/server/quotes';
import { loadCatalog } from '@/server/catalog';
import { shippingSchema, localeQuery, parseQuery } from '@/server/schemas';
export const runtime = 'nodejs';
export const POST = apiRoute(async request => {
  const input = await readJson(request, shippingSchema);
  const { locale } = parseQuery(request, localeQuery);
  return Response.json({ quote: quoteShipping(input, locale, await loadCatalog(locale)) });
}, { mutation: true, rate: 'quote' });
