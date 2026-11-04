import { apiRoute, readJson } from '@/server/http';
import { quoteCheckout } from '@/server/quotes';
import { loadCatalog } from '@/server/catalog';
import { checkoutSchema, localeQuery, parseQuery } from '@/server/schemas';
export const runtime = 'nodejs';
export const POST = apiRoute(async request => {
  const input = await readJson(request, checkoutSchema);
  const { locale } = parseQuery(request, localeQuery);
  return Response.json({ quote: quoteCheckout(input, locale, await loadCatalog(locale)) });
}, { mutation: true, rate: 'quote' });
