"use client";

import Image from "next/image";
import { canArtwork, productArtwork } from "@/domain/product-artwork";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { type ProductSlug, formatPrice } from "@/domain/catalog";
import { useCatalog } from "@/features/catalog/catalog-context";
import { useStore } from "@/features/store/store-context";
import { useLocale } from "@/i18n/locale-context";
import { summarize } from "@/domain/commerce";
import { QuantityPicker } from "./quantity-picker";
import { OrbitScene } from './orbit-scene';
import { SelectionPresence, SelectionRow } from './selection-presence';
import styles from "./catalog.module.css";

export function ProductCatalog({ showHeading = true, orbitPresentation = false }: { showHeading?: boolean; orbitPresentation?: boolean }) {
  const { t, href } = useLocale();
  const { products, loading, error, refreshError, refresh } = useCatalog();
  const { addItems, openCart } = useStore();
  const [selection, setSelection] = useState<Partial<Record<ProductSlug, number>>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalidFields, setInvalidFields] = useState<ProductSlug[]>([]);
  const reduced = useReducedMotion();
  const selectionHeading = useRef<HTMLHeadingElement>(null);
  const entries = products.filter((product) => product.available && selection[product.slug]);
  useEffect(() => {
    if (loading || error) return;
    const next = Object.fromEntries(Object.entries(selection).filter(([slug]) => products.some(product => product.slug === slug && product.available)));
    if (Object.keys(selection).length !== Object.keys(next).length) {
      setSelection(next);
      setMessage('Um sabor selecionado não está mais disponível. Confira sua seleção.');
    }
  },[products,loading,error,selection]);
  let quantity = 0, subtotal = 0, discount = 0, totalsInvalid = false;
  try { ({ quantity, subtotal, discount } = summarize(entries.map((product) => ({ slug: product.slug, quantity: selection[product.slug]! })),products)); }
  catch { totalsInvalid = true; }
  const toggle = (slug: ProductSlug) => {
    setMessage("");
    setInvalidFields((current) => current.filter((value) => value !== slug));
    setSelection((current) => { const next = { ...current }; if (next[slug]) delete next[slug]; else next[slug] = 1; return next; });
  };
  const add = async () => {
    setBusy(true); setMessage("");
    try {
      await addItems(entries.map((product) => ({ slug: product.slug, quantity: selection[product.slug]! })));
      setSelection({}); setInvalidFields([]); setMessage("Adicionado. Sua combinação está ganhando força."); openCart();
    } catch { setMessage("Não foi possível adicionar. Sua seleção foi preservada. Tente novamente."); }
    finally { setBusy(false); }
  };
  return <div className={styles.catalog}>
    {showHeading && <div className={styles.heading}><div className={styles.headingTitle}><h2>{t("Os nossos energéticos.")}</h2></div><p>{t("Escolha seus sabores e monte sua combinação.")}</p></div>}
    {orbitPresentation && <OrbitScene />}
    {loading && !products.length && <p role="status" className={styles.status}>{t('Consultando os sabores e preços…')}</p>}
    {(error || refreshError) && <div role={products.length ? "status" : "alert"} className="alert"><p>{t(error || refreshError)}</p><button type="button" className="btn btn-secondary" onClick={() => void refresh()}>{t('Tentar novamente')}</button></div>}
    {!loading && !error && !products.length && <p role="status" className={styles.status}>{t('Nenhum sabor está disponível no momento.')}</p>}
    {!!products.length && <>
    <LayoutGroup><div className={styles.grid}>
      {products.map((product) => {
        const selected = !!selection[product.slug];
        return <motion.article layout={reduced ? false : 'position'} transition={{ duration: reduced ? 0 : .2 }} className={`${styles.card} ${selected ? styles.selected : ""}`} key={product.slug} style={{ "--flavor-accent": product.accent, "--flavor-background": product.background } as CSSProperties}>
          <div className={styles.cardTitle}><h3>{product.name}</h3><span className={styles.check} aria-hidden="true">{selected ? "✓" : ""}</span></div>
          {!orbitPresentation && <Link className={styles.canLink} href={href(`/produtos/${product.slug}`)} aria-label={`${t("Ver produto")}: ${product.name}`}><Image className={styles.can} src={productArtwork(product.canImage)} alt={`Thunder Fang ${product.name}, ${product.volumeMl} ml`} width={1024} height={1536} sizes="(max-width: 600px) 42vw, 220px" /></Link>}
          <p className={styles.profile}>{product.flavorProfile}</p>
          <p className={styles.price}>{formatPrice(product.priceInCents)} <span>/ {product.volumeMl} ml</span></p>
          <div className={styles.detailLinks}><Link href={href(`/produtos/${product.slug}`)} aria-label={`${t("Ver produto")}: ${product.name}`}>{t("Ver produto")} <span aria-hidden="true">→</span></Link></div>
          <button type="button" className={styles.selectButton} disabled={loading || !product.available} aria-pressed={selected} onClick={() => toggle(product.slug)}>{!product.available ? t('Sabor indisponível') : selected ? t("Sabor selecionado") : t("Selecionar sabor")} <span aria-hidden="true">{selected ? "✓" : "+"}</span></button>
          <AnimatePresence initial={false}>{selected && <SelectionPresence key={product.slug}><QuantityPicker value={selection[product.slug]!} onChange={(value) => setSelection((current) => ({ ...current, [product.slug]: value }))} onValidityChange={(valid) => setInvalidFields((current) => valid ? current.filter((slug) => slug !== product.slug) : current.includes(product.slug) ? current : [...current, product.slug])} label={`${t("Quantidade")}: ${t(product.name)}`} /></SelectionPresence>}</AnimatePresence>
        </motion.article>;
      })}
    </div>
    <motion.section layout={reduced ? false : 'position'} transition={{ duration: reduced ? 0 : .2 }} className={styles.selection} aria-labelledby="selection-title">
      <div className={styles.selectionIntro}><h3 id="selection-title" ref={selectionHeading} tabIndex={-1}>{t("Sua seleção")}</h3><p>{t("10% de desconto nos produtos a partir de seis latas, combinando os sabores.")}</p></div>
      <div className={styles.selectionMain}>
        <AnimatePresence initial={false} mode="wait">{entries.length ? <SelectionPresence key="selected">
          <div className={styles.miniatures} aria-label={t("Sabores selecionados")}><AnimatePresence initial={false}>{entries.map((product) => <motion.div key={product.slug} layout={reduced ? false : 'position'} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .16 }}><Image src={canArtwork(product.slug)} alt={t(product.name)} width={1024} height={1536} sizes="70px" /><span>{selection[product.slug]}×</span></motion.div>)}</AnimatePresence></div>
          <ul className={styles.selectedList}><AnimatePresence initial={false}>{entries.map((product) => <SelectionRow key={product.slug}><span>{selection[product.slug]}× {t(product.name)}</span><button type="button" onClick={() => { toggle(product.slug); selectionHeading.current?.focus({ preventScroll: true }); }} aria-label={`${t("Desmarcar sabor")}: ${t(product.name)}`}>×</button></SelectionRow>)}</AnimatePresence></ul>
          <div className={styles.selectionTotal} aria-live="polite" aria-atomic="true"><span>{quantity} {quantity === 1 ? t("lata") : t("latas")}</span><strong>{totalsInvalid ? t('Reveja a quantidade') : formatPrice(subtotal - discount)}</strong></div>
          <AnimatePresence initial={false}>{discount > 0 && <motion.p key="discount" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .16 }} className={styles.discount}>{t("Desconto de atacado")}: −{formatPrice(discount)}</motion.p>}</AnimatePresence>
          {totalsInvalid && <p role="alert" className={styles.error}>{t("Escolha uma quantidade menor para continuar.")}</p>}
          <button className={styles.primary} type="button" disabled={busy || loading || totalsInvalid || !!invalidFields.length} onClick={add}>{busy ? t("Adicionando…") : t("Adicionar seleção ao carrinho")} <span aria-hidden="true">→</span></button>
        </SelectionPresence> : <SelectionPresence key="empty"><div className={styles.empty}><span aria-hidden="true">＋</span><p>{t("Escolha de um a quatro sabores nos cards acima.")}</p><button className={styles.primary} type="button" disabled>{t("Adicionar seleção ao carrinho")}</button></div></SelectionPresence>}</AnimatePresence>
        <p role="status" className={styles.status}>{t(message)}</p>
      </div>
    </motion.section></LayoutGroup></>}
  </div>;
}
