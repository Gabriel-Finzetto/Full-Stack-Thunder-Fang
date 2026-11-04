import { z } from 'zod';
import { locales } from '@/i18n/config';
import { ApiError } from './errors';

export const slugSchema = z.enum(['original', 'citricos', 'tropicais', 'frutas-vermelhas']);
export const localeSchema = z.enum(locales).default('pt-BR');
export const localeQuery = z.strictObject({ locale: localeSchema });
export const itemsSchema = z.array(z.strictObject({ slug: slugSchema, quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })).min(1).max(256);
export const countrySchema = z.enum(['BR', 'US', 'ES', 'CN']);
const text = (max: number) => z.string().max(max).transform(value => value.trim()).default('');
export const deliverySchema = z.strictObject({
  country: countrySchema, region: z.string().trim().min(1).max(80), postal: text(160), street: text(300), number: text(160),
  noNumber: z.boolean().default(false), complement: text(160), district: text(160), city: text(160), province: text(160), reference: text(300), instructions: text(500),
}).superRefine((delivery, context) => {
  if (!['postal', 'street', 'number', 'complement', 'district', 'city', 'province', 'reference', 'instructions'].some(key => /\S/u.test(delivery[key as keyof typeof delivery] as string))) context.addIssue({ code: 'custom', path: ['street'], message: 'Preencha pelo menos um campo livre de entrega.' });
  if (delivery.noNumber && delivery.number) context.addIssue({ code: 'custom', path: ['number'], message: 'Remova o número ao selecionar Sem número.' });
});
const checkoutShape = { items: itemsSchema, delivery: deliverySchema, method: z.enum(['standard', 'express']) };
export const shippingSchema = z.strictObject({ items: itemsSchema, country: countrySchema, region: z.string().trim().min(1).max(80) });
export const checkoutSchema = z.strictObject(checkoutShape);
export const createOrderSchema = z.strictObject({ ...checkoutShape, reviewToken: z.string().min(1).max(2048) });
export { profileUpdateSchema as profileSchema } from '@/contracts/profile';
export const orderIdSchema = z.uuid();
export const orderQuery = z.strictObject({ locale: localeSchema, limit: z.coerce.number().int().min(1).max(5).default(5), cursor: z.string().max(1024).optional() });
export const contactSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).refine(value => !/[\r\n\u0000]/u.test(value), 'Nome inválido.'),
  email: z.email().max(254), reason: z.enum(['products', 'order', 'partnerships', 'other']), message: z.string().trim().min(1).max(3000),
});
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) { const key = issue.path.join('.') || '_form'; (fields[key] ??= []).push(issue.message); }
  throw new ApiError(400, 'INVALID_INPUT', 'Confira os dados informados.', fields);
}
export function parseQuery<T extends z.ZodType>(request: Request, schema: T): z.output<T> {
  const query = new URL(request.url).searchParams;
  const data: Record<string, string> = {};
  for (const [key, value] of query) { if (key in data) throw new ApiError(400, 'INVALID_INPUT', 'Parâmetro repetido.'); data[key] = value; }
  return parse(schema, data);
}
