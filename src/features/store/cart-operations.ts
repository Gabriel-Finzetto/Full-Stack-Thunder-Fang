import { aggregate, validQuantity, type CartBatch, type CartRecord } from '@/domain/commerce';
import type { ProductSlug } from '@/domain/catalog';

export const CART_UNDO_WINDOW = 10_000;
export type CartUndo = {
  id: string;
  kind: 'remove' | 'clear';
  generation: string;
  batches: CartBatch[];
  consumedOrders: string[];
  expiresAt: number;
};

/** Apply the user's edit as a delta, preserving additions made by another tab. */
export function editCartQuantity(record: CartRecord, slug: ProductSlug, desired: number, observed: number, generation: string, now: number, batchId: string): CartRecord {
  if (!validQuantity(desired) || !validQuantity(observed)) throw new Error('Informe uma quantidade inteira positiva.');
  if (record.generation !== generation) return record;
  const current = aggregate(record.batches).find(item => item.slug === slug)?.quantity;
  if (!current) return record;
  const delta = desired - observed;
  if (!delta) return record;
  let batches: CartBatch[];
  if (delta > 0) batches = [...record.batches, { id: batchId, slug, quantity: delta }];
  else {
    let remaining = Math.min(-delta, current - 1);
    batches = record.batches.map(batch => {
      if (batch.slug !== slug || remaining <= 0) return batch;
      const removed = Math.min(batch.quantity, remaining);
      remaining -= removed;
      return { ...batch, quantity: batch.quantity - removed };
    }).filter(batch => batch.quantity > 0);
  }
  assertSafeQuantities(batches);
  return { ...record, batches, revision: record.revision + 1, lastActivity: now };
}

export function removeCartItems(record: CartRecord, slug: ProductSlug | undefined, now: number, id: string, nextGeneration: string) {
  const batches = record.batches.filter(batch => !slug || batch.slug === slug);
  if (!batches.length) return { record, undo: null };
  const next = { ...record, batches: slug ? record.batches.filter(batch => batch.slug !== slug) : [], generation: slug ? record.generation : nextGeneration, consumedOrders: slug ? record.consumedOrders : [], revision: record.revision + 1, lastActivity: now };
  const undo: CartUndo = { id, kind: slug ? 'remove' : 'clear', generation: next.generation, batches: batches.map(batch => ({ ...batch })), consumedOrders: [...next.consumedOrders], expiresAt: now + CART_UNDO_WINDOW };
  return { record: next, undo };
}

export function canUndoCartRemoval(record: CartRecord, undo: CartUndo, now: number) {
  return now < undo.expiresAt && record.generation === undo.generation
    && record.consumedOrders.length === undo.consumedOrders.length
    && record.consumedOrders.every((order, index) => order === undo.consumedOrders[index]);
}

/** Restore only removed batches; never replace a newer cart snapshot. */
export function restoreCartItems(record: CartRecord, undo: CartUndo, now: number): CartRecord {
  if (!canUndoCartRemoval(record, undo, now)) return record;
  const existing = new Set(record.batches.map(batch => batch.id));
  const missing = undo.batches.filter(batch => !existing.has(batch.id));
  if (!missing.length) return record;
  const batches = [...record.batches, ...missing.map(batch => ({ ...batch }))];
  assertSafeQuantities(batches);
  return { ...record, batches, revision: record.revision + 1, lastActivity: now };
}

function assertSafeQuantities(batches: CartBatch[]) {
  const items = aggregate(batches);
  if (items.some(item => !validQuantity(item.quantity)) || items.reduce((total, item) => total + BigInt(item.quantity), 0n) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('A quantidade excede a faixa numérica segura.');
}
