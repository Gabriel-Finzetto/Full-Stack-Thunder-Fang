import { apiRoute } from '@/server/http';
import { orderIdSchema, parse } from '@/server/schemas';
import { privateServices } from '@/server/private-route';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export const GET = apiRoute(async (request, context: Context) => {
  const id = parse(orderIdSchema, (await context.params).id);
  return Response.json({ order: await (await privateServices(request)).getOrder(id) });
});
export const DELETE = apiRoute(async (request, context: Context) => {
  const id = parse(orderIdSchema, (await context.params).id);
  await (await privateServices(request)).deleteOrder(id, request.headers.get('x-tf-account') ?? undefined);
  return new Response(null, { status: 204 });
}, { mutation: true });
