import { products, type ProductSlug } from './catalog';

export const CART_LIFETIME = 30 * 60 * 1000;
export const MAX_QUANTITY = Number.MAX_SAFE_INTEGER;
export type CartItem = { slug: ProductSlug; quantity: number };
export type CartBatch = CartItem & { id: string };
export type CartRecord = { version: 1; generation: string; revision: number; lastActivity: number; batches: CartBatch[]; consumedOrders: string[] };
export type CartSnapshot = Pick<CartRecord, 'generation' | 'revision' | 'batches'>;
export function validQuantity(value: number) { return Number.isSafeInteger(value) && value > 0 && value <= MAX_QUANTITY; }
export type CartPrice = { slug: ProductSlug; priceInCents: number; available?: boolean };
export function summarize(items: readonly CartItem[], catalogue: readonly CartPrice[] = products) {
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  let quantity = 0n, subtotal = 0n;
  for (const item of items) {
    const product = catalogue.find(candidate => candidate.slug === item.slug);
    if (!validQuantity(item.quantity)) throw new Error('A quantidade excede a faixa numérica segura.');
    if (!product || product.available === false) throw new Error('Um sabor do carrinho não está disponível. Remova-o para continuar.');
    if (!Number.isSafeInteger(product.priceInCents) || product.priceInCents <= 0) throw new Error('Não foi possível consultar o catálogo. Tente novamente.');
    quantity += BigInt(item.quantity);
    subtotal += BigInt(item.quantity) * BigInt(product.priceInCents);
    if (quantity > maximum || subtotal > maximum) throw new Error('A quantidade excede a faixa numérica segura.');
  }
  const discount = quantity >= 6n ? (subtotal + 5n) / 10n : 0n;
  return { quantity: Number(quantity), subtotal: Number(subtotal), discount: Number(discount), productsTotal: Number(subtotal - discount) };
}
export function aggregate(batches: CartBatch[]): CartItem[] {
  const map = new Map<ProductSlug, number>();
  batches.forEach(({ slug, quantity }) => map.set(slug, (map.get(slug) ?? 0) + quantity));
  return Array.from(map, ([slug, quantity]) => ({ slug, quantity }));
}
export function consumeSnapshot(record: CartRecord, snapshot: CartSnapshot, orderId: string): CartRecord {
  if (record.generation !== snapshot.generation || record.consumedOrders.includes(orderId)) return record;
  const captured = new Map(snapshot.batches.map(batch => [batch.id, batch.quantity]));
  return { ...record, revision: record.revision + 1, consumedOrders: [...record.consumedOrders, orderId], batches: record.batches.map(batch => ({ ...batch, quantity: Math.max(0, batch.quantity - (captured.get(batch.id) ?? 0)) })).filter(batch => batch.quantity > 0) };
}
export const nutrition = [
  ['Valor energético', '45 kcal', '225 kcal'], ['Carboidratos', '11 g', '55 g'], ['Açúcares totais', '11 g', '55 g'], ['Açúcares adicionados', '11 g', '55 g'], ['Proteínas', '0 g', '0 g'], ['Gorduras totais', '0 g', '0 g'], ['Gorduras saturadas', '0 g', '0 g'], ['Gorduras trans', '0 g', '0 g'], ['Fibras alimentares', '0 g', '0 g'], ['Sódio', '40 mg', '200 mg'],
] as const;
