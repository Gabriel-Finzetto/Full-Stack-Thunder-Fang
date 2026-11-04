import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { transactCart } from '../src/features/store/cart-database';
import { aggregate, CART_LIFETIME } from '../src/domain/commerce';

afterEach(() => vi.useRealTimers());
describe('transações de carrinho compartilhado', () => {
  it('preserva 40 adições simultâneas sem perder unidades', async () => {
    await transactCart(state => ({ ...state, batches: [], lastActivity: Date.now() }));
    await Promise.all(Array.from({ length: 40 }, (_, index) => transactCart(state => ({ ...state, revision: state.revision + 1, batches: [...state.batches, { id: `batch-${index}`, slug: 'original', quantity: 1 }] }))));
    const { record } = await transactCart(); expect(aggregate(record.batches)).toEqual([{ slug: 'original', quantity: 40 }]);
  });
  it('descarta o carrinho vencido ANTES de uma nova atividade', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
    const before = (await transactCart(state => ({ ...state, lastActivity: Date.now(), batches: [{ id: 'old', slug: 'original', quantity: 6 }] }))).record;
    vi.setSystemTime(Date.now() + CART_LIFETIME);
    const result = await transactCart(state => ({ ...state, lastActivity: Date.now() })); expect(result.expired).toBe(true); expect(result.record.batches).toEqual([]); expect(result.record.generation).not.toBe(before.generation);
  });
  it('reverte a transação inteira se a mutação falha', async () => {
    const before = (await transactCart(state => ({ ...state, lastActivity: Date.now(), batches: [{ id: 'keep', slug: 'citricos', quantity: 3 }] }))).record;
    await expect(transactCart(() => { throw new Error('invalid'); })).rejects.toThrow('invalid');
    expect((await transactCart()).record).toEqual(before);
  });
  it('recupera formato local corrompido sem quebrar a interface', async () => {
    await transactCart(state => ({ ...state, batches: null } as unknown as typeof state));
    const result = await transactCart(); expect(result.recovered).toBe(true); expect(result.record.batches).toEqual([]);
  });
});
