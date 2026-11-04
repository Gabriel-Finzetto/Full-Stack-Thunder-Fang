import { z } from 'zod';
import { brazilRegions } from '@/domain/shipping';
import { internationalRegions } from '@/domain/regions';

const text = (max: number) => z.string().max(max).transform(value => value.trim()).default('');
/** A saved preference never contains a price, delivery promise or review token. */
export const savedDeliverySchema = z.strictObject({
  country: z.enum(['BR', 'US', 'ES', 'CN']), region: z.string().trim().min(1).max(80),
  postal: text(160), street: text(300), number: text(160), noNumber: z.boolean().default(false),
  complement: text(160), district: text(160), city: text(160), province: text(160),
  reference: text(300), instructions: text(500),
}).superRefine((value, context) => {
  const regions = value.country === 'BR' ? brazilRegions : internationalRegions[value.country];
  if (!regions.some(region => region.code === value.region)) context.addIssue({ code: 'custom', path: ['region'], message: 'Selecione uma região válida para o país.' });
  if (!['postal', 'street', 'number', 'complement', 'district', 'city', 'province', 'reference', 'instructions'].some(key => /\S/u.test(value[key as keyof typeof value] as string))) context.addIssue({ code: 'custom', path: ['street'], message: 'Preencha pelo menos um campo livre de entrega.' });
  if (value.noNumber && value.number) context.addIssue({ code: 'custom', path: ['number'], message: 'Remova o número ao selecionar Sem número.' });
});
export const defaultDeliverySchema = z.strictObject({ delivery: savedDeliverySchema, method: z.enum(['standard', 'express']) });
export const profileUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(120), defaultDelivery: defaultDeliverySchema.nullable().optional(),
});
