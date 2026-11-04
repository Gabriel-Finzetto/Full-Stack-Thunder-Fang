import { apiRoute } from '@/server/http';
import { loadCatalog } from '@/server/catalog';
import { localeQuery, parseQuery } from '@/server/schemas';
import { ApiError } from '@/server/errors';
export const runtime = 'nodejs';
export const GET = apiRoute(async (request, context: { params: Promise<{ slug: string }> }) => {
  const { slug } = await context.params;
  const product = (await loadCatalog(parseQuery(request, localeQuery).locale)).products.find(candidate => candidate.slug === slug);
  if (!product) throw new ApiError(404, 'NOT_FOUND', 'Produto não encontrado.');
  return Response.json({ product });
});
