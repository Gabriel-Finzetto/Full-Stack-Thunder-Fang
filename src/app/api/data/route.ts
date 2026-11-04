import { apiRoute } from '@/server/http';
import { localeQuery, parseQuery } from '@/server/schemas';
import { loadCatalog } from '@/server/catalog';
import { privateServices } from '@/server/private-route';
export const runtime = 'nodejs';
export const GET = apiRoute(async request => {
  const { locale } = parseQuery(request, localeQuery);
  const page = await (await privateServices(request)).listOrders({ limit: 5 });
  return Response.json({ products: (await loadCatalog(locale)).products, orders: page.orders });
});
