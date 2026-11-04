import { z } from 'zod';
import type { CheckoutInput, CheckoutQuoteDto, ItemInput, OrderDto, ShippingQuoteDto } from '@/contracts/api';
import type { CartSnapshot } from '@/domain/commerce';
import type { DeliveryDraft } from './checkout-context';

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const days = z.object({ min: z.number().int().nonnegative().nullable(), max: positive }).refine(value => value.min === null || value.min <= value.max);
const option = z.object({ method: z.enum(['standard','express']), priceInCents: money.max(3000), businessDays: days });
const item = z.object({ slug: z.enum(['original','citricos','tropicais','frutas-vermelhas']), name: z.string().min(1), quantity: positive, unitPriceInCents: positive, lineTotalInCents: positive });
const delivery = z.object({
  country: z.enum(['BR','US','ES','CN']), region: z.string().min(1), postal: z.string(), street: z.string(), number: z.string(), noNumber: z.boolean(),
  complement: z.string(), district: z.string(), city: z.string(), province: z.string(), reference: z.string(), instructions: z.string(),
  regionName: z.string().min(1), zone: z.enum(['BR','NA','EU','AS']), resolvedAddress: z.string().min(1), referenceApplied: z.boolean(),
  method: z.enum(['standard','express']), priceInCents: money, businessDays: days,
});
const shippingSchema = z.object({country: delivery.shape.country, region: z.string().min(1), zone: delivery.shape.zone, quantity: positive, currency: z.literal('BRL'), options: z.array(option).length(2) })
  .refine(value => new Set(value.options.map(option => option.method)).size === 2);
const reviewSchema = z.object({
  currency: z.literal('BRL'), quantity: positive, subtotalInCents: positive, discountInCents: money, productsTotalInCents: positive,
  shippingInCents: money.max(3000), totalInCents: positive, items: z.array(item).min(1).max(4), delivery,
  reviewToken: z.string().min(1).max(2048), reviewExpiresAt: z.iso.datetime({offset:true}),
}).superRefine((value, context) => {
  const quantity=value.items.reduce((sum,item)=>sum+BigInt(item.quantity),0n);
  const subtotal=value.items.reduce((sum,item)=>sum+BigInt(item.lineTotalInCents),0n);
  const discount=quantity>=6n?(subtotal+5n)/10n:0n;
  if (quantity!==BigInt(value.quantity)||subtotal!==BigInt(value.subtotalInCents)||discount!==BigInt(value.discountInCents)
    ||subtotal-discount!==BigInt(value.productsTotalInCents)||BigInt(value.productsTotalInCents)+BigInt(value.shippingInCents)!==BigInt(value.totalInCents)
    ||value.shippingInCents!==value.delivery.priceInCents||new Set(value.items.map(item=>item.slug)).size!==value.items.length
    ||value.items.some(item=>BigInt(item.quantity)*BigInt(item.unitPriceInCents)!==BigInt(item.lineTotalInCents))) context.addIssue({code:'custom',message:'Invalid monetary review.'});
});

export function readShippingQuote(value: unknown): ShippingQuoteDto { return shippingSchema.parse(value); }
export function readCheckoutQuote(value: unknown): CheckoutQuoteDto { return reviewSchema.parse(value); }
export function checkoutInput(items: readonly ItemInput[], draft: DeliveryDraft): CheckoutInput | null {
  if (draft.method!=='standard'&&draft.method!=='express') return null;
  const {method,...fields}=draft;
  const normalized = Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,typeof value==='string'?value.trim():value]));
  return {items:items.map(item=>({...item})),delivery:normalized as CheckoutInput['delivery'],method};
}
export function reviewStateKey(cartToken: string, catalogueRevision: string, input: CheckoutInput): string {
  return JSON.stringify([cartToken,catalogueRevision,input]);
}
export function snapshotMatchesItems(snapshot: CartSnapshot, items: readonly ItemInput[]): boolean {
  const quantities = (entries: readonly ItemInput[]) => {
    const map=new Map<string,bigint>();
    for(const item of entries){if(!Number.isSafeInteger(item.quantity)||item.quantity<1)return null;map.set(item.slug,(map.get(item.slug)??0n)+BigInt(item.quantity));}
    return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([slug,quantity])=>`${slug}:${quantity}`).join('|');
  };
  return quantities(snapshot.batches)!==null && quantities(snapshot.batches)===quantities(items);
}
export function reviewUsable(review: {key:string;ownerId:string|null;identityVersion:number;quote:CheckoutQuoteDto}, state: {key:string;ownerId:string|null;identityVersion:number}, now=Date.now()): boolean {
  return review.key===state.key&&review.ownerId===state.ownerId&&review.identityVersion===state.identityVersion&&Date.parse(review.quote.reviewExpiresAt)>now;
}
export function quoteMatchesInput(quote: Pick<CheckoutQuoteDto,'delivery'|'items'>, input: CheckoutInput): boolean {
  const {regionName:_regionName,zone:_zone,resolvedAddress:_address,referenceApplied:_reference,priceInCents:_price,businessDays:_days,method,...fields}=quote.delivery;
  return snapshotMatchesItems({generation:'comparison',revision:0,batches:quote.items.map((item,index)=>({...item,id:String(index)}))},input.items)
    &&method===input.method&&Object.entries(input.delivery).every(([key,value])=>fields[key as keyof typeof fields]===value);
}

export function orderMatchesReview(order: OrderDto, quote: CheckoutQuoteDto, input: CheckoutInput, ownerId: string): boolean {
  return order.ownerId===ownerId&&quoteMatchesInput(order,input)
    &&(['quantity','subtotalInCents','discountInCents','productsTotalInCents','shippingInCents','totalInCents'] as const).every(key=>order[key]===quote[key])
    &&quote.items.every(accepted=>order.items.some(item=>item.slug===accepted.slug&&item.quantity===accepted.quantity&&item.unitPriceInCents===accepted.unitPriceInCents&&item.lineTotalInCents===accepted.lineTotalInCents))
    &&order.delivery.resolvedAddress===quote.delivery.resolvedAddress&&order.delivery.referenceApplied===quote.delivery.referenceApplied
    &&order.delivery.zone===quote.delivery.zone&&order.delivery.businessDays.min===quote.delivery.businessDays.min&&order.delivery.businessDays.max===quote.delivery.businessDays.max;
}

export function orderResultUncertain(error: unknown): boolean {
  const value=error&&typeof error==='object'?error as {code?:unknown;status?:unknown}:{};
  return value.code==='ORDER_RESULT_UNKNOWN'||typeof value.status!=='number'||!Number.isInteger(value.status)||value.status<400||value.status>=500;
}

export class CheckoutRequestError extends Error {
  constructor(public readonly code: string, public readonly status?: number, public readonly fieldErrors?: Record<string,string[]>) {super(code);}
}
export async function postQuote<T>(path: string, input: unknown, read: (value:unknown)=>T, signal: AbortSignal): Promise<T> {
  const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),cache:'no-store',signal});
  const body:unknown=await response.json();
  if(!response.ok){const value=body&&typeof body==='object'?body as Record<string,unknown>:{};throw new CheckoutRequestError(typeof value.code==='string'?value.code:'SERVICE_UNAVAILABLE',response.status);}
  return read(body&&typeof body==='object'&&'quote'in body?body.quote:undefined);
}
