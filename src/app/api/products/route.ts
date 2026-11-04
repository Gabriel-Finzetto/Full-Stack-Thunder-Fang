import { apiRoute } from '@/server/http';
import { loadCatalog } from '@/server/catalog';
import { localeQuery, parseQuery } from '@/server/schemas';
export const runtime = 'nodejs';
export const GET = apiRoute(async request => Response.json({ products: (await loadCatalog(parseQuery(request, localeQuery).locale)).products }));
