import { apiRoute, readJson } from '@/server/http';
import { createOrderSchema, orderQuery, localeQuery, parseQuery } from '@/server/schemas';
import { privateServices } from '@/server/private-route';
export const runtime = 'nodejs';
export const GET = apiRoute(async request => {
  const { limit, cursor } = parseQuery(request, orderQuery);
  return Response.json(await (await privateServices(request)).listOrders({ limit, cursor }));
});
export const POST = apiRoute(async request => {
  const input = await readJson(request, createOrderSchema);
  const { locale } = parseQuery(request, localeQuery);
  // An expected identity only prevents a stale UI from submitting under another session.
  // Authentication and ownership still come exclusively from the verified server context.
  const order = await (await privateServices(request)).createOrder(input, locale, request.headers.get('x-tf-account') ?? undefined);
  return Response.json({ order }, { status: 201 });
}, { mutation: true });
