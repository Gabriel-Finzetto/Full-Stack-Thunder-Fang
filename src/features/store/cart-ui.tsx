'use client';
import Image from 'next/image';
import { canArtwork } from '@/domain/product-artwork';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { getProduct, type ProductSlug } from '@/domain/catalog';
import { MAX_QUANTITY, validQuantity } from '@/domain/commerce';
import { useCatalog } from '@/features/catalog/catalog-context';
import type { CheckoutQuoteDto } from '@/contracts/api';
import { useLocale } from '@/i18n/locale-context';
import { useStore } from './store-context';
import { Modal, Money, PageShell } from '@/components/ui';
import styles from './cart-ui.module.css';

export function CartSummary({ shipping, quote }: { shipping?: number; quote?: CheckoutQuoteDto | null }) {
  const { t } = useLocale(); const { totals, catalogReady, catalogError, catalogLoading } = useStore();
  if (!quote && !catalogReady) return <div className="summary"><p role={catalogLoading ? 'status' : 'alert'}>{t(catalogLoading ? 'Consultando os sabores e preços…' : catalogError || 'Confira os sabores disponíveis para continuar.')}</p></div>;
  const subtotal = quote?.subtotalInCents ?? totals.subtotal;
  const discount = quote?.discountInCents ?? totals.discount;
  const delivery = quote?.shippingInCents ?? shipping;
  const total = quote?.totalInCents ?? totals.productsTotal + (delivery ?? 0);
  return <div className="summary"><dl><div><dt>{t('Subtotal')}</dt><dd><Money cents={subtotal} /></dd></div>{discount > 0 && <div className="discount"><dt>{t('Desconto de atacado (10%)')}</dt><dd>−<Money cents={discount} /></dd></div>}<div><dt>{t('Frete')}</dt><dd>{delivery === undefined ? t('Na próxima etapa') : <Money cents={delivery} />}</dd></div><div className="grand-total"><dt>{t(delivery === undefined ? 'Total dos produtos' : 'Total')}</dt><dd>{Number.isSafeInteger(total) ? <Money cents={total} /> : t('Reveja a quantidade')}</dd></div></dl><p className="muted">{t('A partir de 6 latas combinadas, 10% de desconto nos produtos.')}</p></div>;
}

function CartRow({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const present = useIsPresent();
  return <motion.li layout={!reduced} initial={false} exit={{ opacity: 0, x: reduced ? 0 : -10 }} transition={{ duration: reduced ? 0 : .16, ease: 'easeOut' }} inert={!present} aria-hidden={!present || undefined}>{children}</motion.li>;
}

function CartState({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const present = useIsPresent();
  return <motion.div layout={!reduced} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .16 }} inert={!present} aria-hidden={!present || undefined}>{children}</motion.div>;
}

function CartQuantity({ slug, value, generation, disabled, increasingDisabled, name }: { slug: ProductSlug; value: number; generation: string; disabled: boolean; increasingDisabled: boolean; name: string }) {
  const { t } = useLocale(); const { setQuantity } = useStore(); const id = useId();
  const [draft, setDraft] = useState<string | null>(null); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const baseline = useRef({ value, generation });
  const committing = useRef(false);
  const commit = async (desired: number, observed = value, observedGeneration = generation) => {
    if (committing.current) return;
    if (!validQuantity(desired)) { setError('Informe uma quantidade inteira maior que zero. Se o valor for muito alto, escolha uma quantidade menor.'); return; }
    if (increasingDisabled && desired > observed) { setError('Não foi possível consultar o catálogo. Tente novamente.'); return; }
    setDraft(null); setError('');
    if (desired === observed) return;
    committing.current = true;
    setSaving(true);
    try { await setQuantity(slug, desired, observed, observedGeneration); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o carrinho. Tente novamente.'); }
    finally { committing.current = false; setSaving(false); }
  };
  const commitDraft = () => { if (draft !== null) { if (/^\d+$/.test(draft)) void commit(Number(draft), baseline.current.value, baseline.current.generation); else setError('Informe uma quantidade inteira maior que zero. Se o valor for muito alto, escolha uma quantidade menor.'); } };
  const step = (direction: number) => {
    const draftValue = draft !== null && /^\d+$/.test(draft) && validQuantity(Number(draft)) ? Number(draft) : value;
    void commit(draftValue + direction, draft !== null ? baseline.current.value : value, draft !== null ? baseline.current.generation : generation);
  };
  return <div className={styles.quantityControl} aria-busy={saving}>
    <label htmlFor={id}>{t('Quantidade')}: {name}</label>
    <div className={styles.quantityInput}>
      <button type="button" disabled={disabled || saving || (draft === null && value <= 1)} aria-label={`${t('Diminuir quantidade')}: ${name}`} onPointerDown={event => event.preventDefault()} onClick={() => step(-1)}>−</button>
      <input id={id} type="text" inputMode="numeric" pattern="[0-9]*" value={draft ?? value} disabled={disabled} readOnly={saving} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onFocus={() => { baseline.current = { value, generation }; }} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={commitDraft} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitDraft(); } if (event.key === 'Escape') { setDraft(null); setError(''); } }} />
      <button type="button" disabled={disabled || saving || increasingDisabled || value >= MAX_QUANTITY} aria-label={`${t('Aumentar quantidade')}: ${name}`} onPointerDown={event => event.preventDefault()} onClick={() => step(1)}>+</button>
    </div>
    <div className={styles.shortcuts} role="group" aria-label={`${t('Atalhos de quantidade')}: ${name}`}>{[6, 12].map(quantity => <button key={quantity} type="button" aria-pressed={value === quantity} disabled={disabled || saving || (increasingDisabled && quantity > value)} onPointerDown={event => event.preventDefault()} onClick={() => void commit(quantity)}>{quantity}</button>)}</div>
    {error && <p id={`${id}-error`} className={styles.quantityError} role="alert">{t(error)}</p>}
  </div>;
}

export function CartContents({ compact = false }: { compact?: boolean }) {
  const { t, href } = useLocale(); const store = useStore();
  const { cart, loading, error, refresh, removeItem, clearCart, closeCart, catalogReady, catalogError, catalogLoading, pendingUndo, undoRemoval, dismissUndo } = store;
  const catalog = useCatalog(); const reduced = Boolean(useReducedMotion());
  const [busy, setBusy] = useState(false); const [failure, setFailure] = useState('');
  const region = useRef<HTMLDivElement>(null); const undoButton = useRef<HTMLButtonElement>(null);
  const undoWasFocused = useRef(false);
  useEffect(() => { if (!pendingUndo && undoWasFocused.current) { region.current?.focus({ preventScroll: true }); undoWasFocused.current = false; } }, [pendingUndo]);
  const act = async (operation: () => Promise<void>, focusUndo = false) => {
    setBusy(true); setFailure('');
    try { await operation(); if (focusUndo) requestAnimationFrame(() => undoButton.current?.focus({ preventScroll: true })); }
    catch { setFailure(t('Não foi possível atualizar o carrinho. Tente novamente.')); }
    finally { setBusy(false); }
  };
  if (loading) return <p role="status" className="empty-state">{t('Carregando…')}</p>;
  if (error) return <div className="alert" role="alert"><p>{t(error)}</p><button className="btn btn-secondary" onClick={() => void refresh().catch(() => {})}>{t('Tentar novamente')}</button></div>;
  return <div ref={region} tabIndex={-1} className={styles.contents} aria-label={t('Carrinho')}>
    <AnimatePresence initial={false}>
      {pendingUndo && <CartState key={pendingUndo.id} reduced={reduced}><div className={styles.undo}>
        <p role="status">{t(pendingUndo.kind === 'clear' ? 'Carrinho esvaziado.' : 'Sabor removido do carrinho.')}</p>
        <button ref={undoButton} type="button" disabled={busy} onFocus={() => { undoWasFocused.current = true; }} onBlur={() => { undoWasFocused.current = false; }} onClick={() => { region.current?.focus({ preventScroll: true }); void act(undoRemoval); }}>{t('Desfazer')}</button>
        <button type="button" className={styles.dismissUndo} aria-label={t('Fechar')} onClick={() => { region.current?.focus({ preventScroll: true }); dismissUndo(); }}>×</button>
      </div></CartState>}
    </AnimatePresence>
    <AnimatePresence initial={false} mode="wait">
      {!cart.items.length ? <CartState key="empty" reduced={reduced}><div className="empty-state"><span aria-hidden="true">＋</span><h3>{t('Seu carrinho está vazio')}</h3><p>{t('Sua próxima combinação começa aqui. Escolha seus sabores.')}</p><Link className="btn" href={href('/produtos')} onClick={closeCart}>{t('Escolher sabores')}</Link></div></CartState> : <CartState key="items" reduced={reduced}>
        {(catalogError || catalogLoading || catalog.refreshError) && <div className="alert" role={catalogLoading || catalog.refreshError ? 'status' : 'alert'}><p>{t(catalogLoading ? 'Consultando os sabores e preços…' : catalogError || catalog.refreshError)}</p>{!catalogLoading && <button className="btn btn-secondary" type="button" onClick={() => void catalog.refresh()}>{t('Tentar novamente')}</button>}</div>}
        <motion.ul layout={!reduced} className="cart-items"><AnimatePresence initial={false}>{cart.items.map(item => {
          const live = catalog.findProduct(item.slug), product = live ?? getProduct(item.slug)!;
          const available = !!live?.available, lineTotal = live ? live.priceInCents * item.quantity : 0;
          return <CartRow key={item.slug} reduced={reduced}>
            <Image className="cart-can" src={canArtwork(item.slug)} alt={`Thunder Fang ${product.name}`} width={76} height={180} />
            <div className="cart-item-body">
              <Link href={href(`/produtos/${item.slug}`)} onClick={closeCart}><strong>{product.name}</strong></Link>
              <p className="muted">{product.volumeMl} ml · {available ? <Money cents={live!.priceInCents} /> : t(catalogLoading ? 'Consultando preços…' : 'Sabor indisponível')}</p>
              <CartQuantity slug={item.slug} value={item.quantity} generation={cart.generation} disabled={busy} increasingDisabled={!catalogReady || !available} name={product.name} />
              <button type="button" className="remove-link" disabled={busy} onClick={() => void act(() => removeItem(item.slug), true)}>{t('Remover sabor')}</button>
            </div>
            <strong className="line-total">{available && Number.isSafeInteger(lineTotal) ? <Money cents={lineTotal} /> : '—'}</strong>
          </CartRow>;
        })}</AnimatePresence></motion.ul>
        <button type="button" className="remove-link" disabled={busy} onClick={() => void act(clearCart, true)}>{t('Esvaziar carrinho')}</button>
        <motion.div layout={!reduced} transition={{ duration: reduced ? 0 : .16 }}><CartSummary /></motion.div>
        <div className="stack-actions">
          {catalogReady ? <Link className="btn" href={href('/checkout')} onClick={closeCart}>{t('Finalizar pedido')} <span aria-hidden="true">→</span></Link> : <button className="btn" type="button" disabled>{t('Finalizar pedido')}</button>}
          {compact && <Link href={href('/carrinho')} className="btn btn-secondary" onClick={closeCart}>{t('Ver carrinho completo')}</Link>}
        </div>
        <p className="muted fine-print">{t('Carrinho compartilhado entre as guias deste navegador. Expira após 30 minutos sem atividade.')}</p>
      </CartState>}
    </AnimatePresence>
    {failure && <p role="alert" className="alert">{failure}</p>}
  </div>;
}
export function CartDrawer() { const { t } = useLocale(); const { drawerOpen, closeCart } = useStore(); return <Modal drawer open={drawerOpen} onClose={closeCart} title={t('Carrinho')}><CartContents compact /></Modal>; }
export function CartPage() { const { t } = useLocale(); return <PageShell title={t('Carrinho')} description={t('Tudo pronto para concluir?')}><div className="panel cart-page-panel"><CartContents /></div></PageShell>; }
export function StoreNotice() {
  const { t } = useLocale(); const { notice, clearNotice } = useStore();
  useEffect(() => {
    if (notice !== 'Adicionado. Sua combinação está ganhando força.' && notice !== 'Remoção desfeita.') return;
    const timer = setTimeout(clearNotice, 6000);
    return () => clearTimeout(timer);
  }, [notice, clearNotice]);
  return notice ? <div className={`store-notice ${styles.storeNotice}`} role="status"><p>{t(notice)}</p><button type="button" className="icon-button" aria-label={t('Fechar')} onClick={clearNotice}>×</button></div> : null;
}
