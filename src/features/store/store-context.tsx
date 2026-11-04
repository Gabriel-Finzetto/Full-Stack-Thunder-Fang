'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { aggregate, consumeSnapshot, summarize, validQuantity, type CartItem, type CartRecord, type CartSnapshot } from '@/domain/commerce';
import { getProduct, type ProductSlug } from '@/domain/catalog';
import { useCatalog } from '@/features/catalog/catalog-context';
import { transactCart } from './cart-database';
import { canUndoCartRemoval, editCartQuantity, removeCartItems, restoreCartItems, type CartUndo } from './cart-operations';

type StoreValue = {
  cart: { items: CartItem[]; generation: string; revision: number; lastActivity: number };
  totals: ReturnType<typeof summarize>; loading: boolean; error: string; notice: string; drawerOpen: boolean;
  catalogReady: boolean; catalogError: string; catalogLoading: boolean; unavailableSlugs: ProductSlug[];
  addItems(items: CartItem[]): Promise<void>; removeUnits(slug: ProductSlug, quantity: number): Promise<void>;
  removeItem(slug: ProductSlug): Promise<void>; clearCart(): Promise<void>;
  setQuantity(slug: ProductSlug, quantity: number, observed: number, generation: string): Promise<void>;
  pendingUndo: CartUndo | null; undoRemoval(): Promise<void>; dismissUndo(): void;
  capture(): CartSnapshot; consume(snapshot: CartSnapshot, orderId: string): Promise<void>; refresh(): Promise<void>;
  openCart(): void; closeCart(): void; clearNotice(): void;
};
const StoreContext = createContext<StoreValue | null>(null);
const empty: CartRecord = { version: 1, generation: '', revision: 0, lastActivity: 0, batches: [], consumedOrders: [] };
export function StoreProvider({ children }: { children: ReactNode }) {
  const catalog = useCatalog();
  const [record, setRecord] = useState(empty); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [drawerOpen, setDrawerOpen] = useState(false);
  const clearNotice = useCallback(() => setNotice(''), []);
  const [pendingUndo, setPendingUndo] = useState<CartUndo | null>(null);
  const undo = useRef<CartUndo | null>(null);
  const dismissUndo = useCallback(() => { undo.current = null; setPendingUndo(null); }, []);
  const channel = useRef<BroadcastChannel | null>(null); const current = useRef(record); current.current = record;
  const perform = useCallback(async (change?: (state: CartRecord) => CartRecord, announce = true) => {
    try {
      const result = await transactCart(change); current.current = result.record; setRecord(result.record); setError('');
      if (undo.current && !canUndoCartRemoval(result.record, undo.current, Date.now())) dismissUndo();
      if (result.expired) setNotice('Seu carrinho expirou após 30 minutos sem atividade. Escolha seus sabores para começar novamente.');
      else if (result.recovered) setNotice('O carrinho local estava inválido e foi reiniciado. Escolha seus sabores novamente.');
      if (announce) { try { channel.current?.postMessage('changed'); localStorage.setItem('tf-cart-signal', `${Date.now()}-${Math.random()}`); } catch { /* The committed IndexedDB operation is authoritative; periodic reconciliation remains available. */ } }
      return result;
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'Falha ao atualizar o carrinho.'; setError(message); throw cause; }
    finally { setLoading(false); }
  }, [dismissUndo]);
  useEffect(() => {
    if (!pendingUndo) return;
    const timer = setTimeout(dismissUndo, Math.max(0, pendingUndo.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [pendingUndo, dismissUndo]);
  const refresh = useCallback(async () => { await perform(undefined, false); }, [perform]);
  useEffect(() => {
    void refresh().catch(() => {});
    channel.current = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('thunder-fang-cart') : null;
    const reconcile = () => { void refresh().catch(() => {}); };
    if (channel.current) channel.current.onmessage = reconcile;
    let timer: ReturnType<typeof setTimeout> | undefined; let lastWrite = 0;
    const activity = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      const touch = () => { lastWrite = Date.now(); void perform(state => ({ ...state, lastActivity: Date.now() })).catch(() => {}); };
      if (now - lastWrite >= 1000) touch();
      else if (!timer) timer = setTimeout(() => { timer = undefined; touch(); }, 1000 - (now - lastWrite));
    };
    const focus = () => { void perform(state => ({ ...state, lastActivity: Date.now() })).catch(() => {}); };
    const storage = (event: StorageEvent) => { if (event.key === 'tf-cart-signal') reconcile(); };
    ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(event => window.addEventListener(event, activity, { passive: true }));
    window.addEventListener('focus', focus); window.addEventListener('storage', storage);
    const interval = setInterval(reconcile, 10000);
    return () => { channel.current?.close(); window.removeEventListener('focus', focus); window.removeEventListener('storage', storage); clearInterval(interval); if (timer) clearTimeout(timer); ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(event => window.removeEventListener(event, activity)); };
  }, [perform, refresh]);
  const addItems = async (items: CartItem[]) => {
    if (!items.length || items.some(item => !getProduct(item.slug) || !validQuantity(item.quantity))) throw new Error('Informe uma quantidade inteira positiva.');
    if (catalog.loading || catalog.error) throw new Error('Não foi possível consultar o catálogo. Tente novamente.');
    await perform(state => { const batches = [...state.batches, ...items.map(item => ({ ...item, id: crypto.randomUUID() }))]; summarize(aggregate(batches),catalog.products); return { ...state, batches, revision: state.revision + 1, lastActivity: Date.now() }; });
    setNotice('Adicionado. Sua combinação está ganhando força.'); setDrawerOpen(true);
  };
  const removeUnits = async (slug: ProductSlug, quantity: number) => {
    await perform(state => { let remaining = quantity; const batches = state.batches.map(batch => { if (batch.slug !== slug || remaining <= 0) return batch; const used = Math.min(batch.quantity, remaining); remaining -= used; return { ...batch, quantity: batch.quantity - used }; }).filter(batch => batch.quantity > 0); return { ...state, batches, revision: state.revision + 1, lastActivity: Date.now() }; });
  };
  const setQuantity = async (slug: ProductSlug, quantity: number, observed: number, generation: string) => {
    if (quantity > observed && (catalog.loading || catalog.error || !catalog.findProduct(slug)?.available)) throw new Error('Não foi possível consultar o catálogo. Tente novamente.');
    let stale = false;
    await perform(state => {
      stale = state.generation !== generation || !state.batches.some(batch => batch.slug === slug);
      if (stale) return state;
      const next = editCartQuantity(state, slug, quantity, observed, generation, Date.now(), crypto.randomUUID());
      if (quantity > observed) summarize(aggregate(next.batches), catalog.products);
      return next;
    });
    if (stale) throw new Error('O carrinho mudou em outra guia ou expirou. Confira a quantidade atual.');
  };
  const remove = async (slug?: ProductSlug) => {
    let removal: CartUndo | null = null;
    await perform(state => {
      const result = removeCartItems(state, slug, Date.now(), crypto.randomUUID(), crypto.randomUUID());
      removal = result.undo;
      return result.record;
    });
    undo.current = removal; setPendingUndo(removal);
    setNotice('');
  };
  const removeItem = (slug: ProductSlug) => remove(slug);
  const clearCart = () => remove();
  const undoRemoval = async () => {
    const token = undo.current;
    if (!token) return;
    // Claim synchronously so two mounted cart views cannot restore twice.
    undo.current = null; setPendingUndo(null);
    let restored = false;
    try {
      await perform(state => { const next = restoreCartItems(state, token, Date.now()); restored = next !== state; return next; });
      setNotice(restored ? 'Remoção desfeita.' : 'Não é mais possível desfazer. Confira o carrinho atual.');
    } catch (cause) {
      if (!undo.current && canUndoCartRemoval(current.current, token, Date.now())) { undo.current = token; setPendingUndo(token); }
      throw cause;
    }
  };
  const items = useMemo(() => aggregate(record.batches), [record.batches]);
  const unavailableSlugs = items.filter(item => !catalog.findProduct(item.slug)?.available).map(item => item.slug);
  let totals: ReturnType<typeof summarize> = { quantity: items.reduce((quantity,item) => quantity + item.quantity,0), subtotal: 0, discount: 0, productsTotal: 0 };
  let pricingError = '';
  if (!catalog.loading && !catalog.error) {
    try { totals = summarize(items,catalog.products); }
    catch (failure) { pricingError = failure instanceof Error ? failure.message : 'Não foi possível consultar o catálogo. Tente novamente.'; }
  }
  const catalogError = catalog.error || pricingError;
  const catalogReady = !catalog.loading && !catalogError && !unavailableSlugs.length;
  const value: StoreValue = { cart: { items, generation: record.generation, revision: record.revision, lastActivity: record.lastActivity }, totals, loading, error, notice, drawerOpen, catalogReady, catalogError, catalogLoading: catalog.loading, unavailableSlugs, addItems, removeUnits, removeItem, clearCart, refresh,
    pendingUndo, undoRemoval, dismissUndo, setQuantity,
    capture: () => ({ generation: current.current.generation, revision: current.current.revision, batches: current.current.batches.map(batch => ({ ...batch })) }),
    consume: async (snapshot, id) => { await perform(state => consumeSnapshot(state, snapshot, id)); }, openCart: () => setDrawerOpen(true), closeCart: () => setDrawerOpen(false), clearNotice };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export function useStore() { const value = useContext(StoreContext); if (!value) throw new Error('StoreProvider ausente'); return value; }
