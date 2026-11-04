import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aggregate, CART_LIFETIME, consumeSnapshot, type CartRecord } from '../src/domain/commerce';
import { CART_UNDO_WINDOW, editCartQuantity, removeCartItems, restoreCartItems } from '../src/features/store/cart-operations';
import { transactCart } from '../src/features/store/cart-database';

const now = 1000;
const cart = (): CartRecord => ({ version: 1, generation: 'current', revision: 1, lastActivity: now, consumedOrders: [], batches: [{ id: 'original-batch', slug: 'original', quantity: 6 }, { id: 'citrus-batch', slug: 'citricos', quantity: 2 }] });
afterEach(() => vi.useRealTimers());

describe('edição de quantidades sem perder alterações entre guias', () => {
  it('aplica o delta de 6 para 12 preservando duas latas adicionadas depois', () => {
    const state = cart(); state.batches.push({ id: 'another-tab', slug: 'original', quantity: 2 });
    const result = editCartQuantity(state, 'original', 12, 6, state.generation, now + 1, 'edit');
    expect(aggregate(result.batches)).toContainEqual({ slug: 'original', quantity: 14 });
    expect(result.batches.find(batch => batch.id === 'another-tab')?.quantity).toBe(2);
  });
  it('reduz lotes antigos sem remover novas adições', () => {
    const state = cart(); state.batches.push({ id: 'new', slug: 'original', quantity: 3 });
    const result = editCartQuantity(state, 'original', 1, 6, state.generation, now + 1, 'edit');
    expect(aggregate(result.batches)).toContainEqual({ slug: 'original', quantity: 4 });
    expect(result.batches.find(batch => batch.id === 'new')?.quantity).toBe(3);
  });
  it('não revive linha removida nem geração expirada', () => {
    const state = cart();
    expect(editCartQuantity({ ...state, generation: 'new', batches: [] }, 'original', 12, 6, state.generation, now, 'edit').batches).toEqual([]);
    expect(editCartQuantity({ ...state, batches: [] }, 'original', 12, 6, state.generation, now, 'edit').batches).toEqual([]);
  });
  it('rejeita frações, zero e overflow sem alterar o registro', () => {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => editCartQuantity(cart(), 'original', value, 6, 'current', now, 'edit')).toThrow();
    const state = cart(); state.batches[0].quantity = Number.MAX_SAFE_INTEGER;
    expect(() => editCartQuantity(state, 'original', 7, 6, 'current', now, 'edit')).toThrow();
  });
  it('serializa edição e adição concorrentes no IndexedDB', async () => {
    const initial = (await transactCart(state => ({ ...state, generation: 'concurrent-edit', lastActivity: Date.now(), batches: [{ id: 'base', slug: 'original', quantity: 6 }] }))).record;
    await Promise.all([
      transactCart(state => editCartQuantity(state, 'original', 12, 6, initial.generation, Date.now(), 'edit')),
      transactCart(state => ({ ...state, batches: [...state.batches, { id: 'new', slug: 'original', quantity: 2 }] })),
    ]);
    expect(aggregate((await transactCart()).record.batches)).toEqual([{ slug: 'original', quantity: 14 }]);
  });
  it('mantém aumentos fora dos lotes capturados por uma compra anterior', () => {
    const state = cart(); const snapshot = { generation: state.generation, revision: state.revision, batches: state.batches.map(batch => ({ ...batch })) };
    const edited = editCartQuantity(state, 'original', 12, 6, state.generation, now + 1, 'new-edit');
    expect(aggregate(consumeSnapshot(edited, snapshot, 'order').batches)).toEqual([{ slug:'original', quantity:6 }]);
  });
});

describe('desfazer remoção com restauração de lotes', () => {
  it('restaura os lotes removidos sem sobrescrever uma adição posterior', () => {
    const removed = removeCartItems(cart(), 'original', now, 'undo', 'unused');
    const newer = { ...removed.record, batches: [...removed.record.batches, { id: 'new', slug: 'original' as const, quantity: 3 }] };
    const restored = restoreCartItems(newer, removed.undo!, now + 1);
    expect(aggregate(restored.batches)).toContainEqual({ slug: 'original', quantity: 9 });
    expect(restored.batches.find(batch => batch.id === 'new')?.quantity).toBe(3);
    expect(restoreCartItems(restored, removed.undo!, now + 2)).toBe(restored);
  });
  it('desfaz esvaziamento na geração nova e preserva novos sabores', () => {
    const removed = removeCartItems(cart(), undefined, now, 'undo', 'after-clear');
    expect(removed.record.generation).toBe('after-clear');
    const newer = { ...removed.record, batches: [{ id: 'new', slug: 'tropicais' as const, quantity: 12 }] };
    expect(aggregate(restoreCartItems(newer, removed.undo!, now + 1).batches)).toHaveLength(3);
  });
  it('expira a oportunidade e rejeita outro esvaziamento ou compra concluída', () => {
    const removed = removeCartItems(cart(), 'original', now, 'undo', 'unused');
    expect(restoreCartItems(removed.record, removed.undo!, now + CART_UNDO_WINDOW)).toBe(removed.record);
    const replaced = { ...removed.record, generation: 'another-clear' };
    expect(restoreCartItems(replaced, removed.undo!, now + 1)).toBe(replaced);
    const purchased = consumeSnapshot(removed.record, { generation: removed.record.generation, revision: removed.record.revision, batches: removed.record.batches }, 'order-1');
    expect(restoreCartItems(purchased, removed.undo!, now + 1)).toBe(purchased);
  });
  it('não revive carrinho que expirou antes da transação de desfazer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    const initial = (await transactCart(state => ({ ...cart(), generation: state.generation, lastActivity: Date.now() }))).record;
    const removed = removeCartItems(initial, 'original', Date.now(), 'undo', 'unused');
    await transactCart(() => removed.record);
    // Even a still-valid token cannot bypass the storage's generation rotation.
    const extended = { ...removed.undo!, expiresAt: Date.now() + CART_LIFETIME * 2 };
    vi.setSystemTime(Date.now() + CART_LIFETIME);
    const result = await transactCart(state => restoreCartItems(state, extended, Date.now()));
    expect(result.expired).toBe(true); expect(result.record.batches).toEqual([]);
  });
  it('rejeita restauração que excede a quantidade segura sem substituir lotes novos', () => {
    const removed = removeCartItems(cart(), 'original', now, 'undo', 'unused');
    const current = { ...removed.record, batches: [{ id:'new', slug:'original' as const, quantity:Number.MAX_SAFE_INTEGER }] };
    expect(() => restoreCartItems(current, removed.undo!, now + 1)).toThrow();
    expect(current.batches).toEqual([{id:'new',slug:'original',quantity:Number.MAX_SAFE_INTEGER}]);
  });
});
