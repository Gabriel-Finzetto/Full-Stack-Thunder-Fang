"use client";

import Image from "next/image";
import { productArtwork } from "@/domain/product-artwork";
import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { formatPrice, type ProductSlug } from "@/domain/catalog";
import { useCatalog } from "@/features/catalog/catalog-context";
import { PageShell } from "@/components/ui";
import { useStore } from "@/features/store/store-context";
import { useLocale } from "@/i18n/locale-context";
import { nutrition, summarize } from "@/domain/commerce";
import { QuantityPicker } from "./quantity-picker";
import styles from "./catalog.module.css";

export function ProductDetail({ slug }: { slug: ProductSlug }) {
  const { products, findProduct, loading, error, refreshError, refresh } = useCatalog();
  const product = findProduct(slug);
  const { t, href } = useLocale();
  const { addItems, openCart } = useStore();
  const [quantity, setQuantity] = useState(1);
  const [view, setView] = useState<"can" | "pack" | "label">("can");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [validQuantity, setValidQuantity] = useState(true);
  const purchaseAction = useRef<HTMLButtonElement>(null);
  // Only hide the dock when the whole action clears the sticky header and dock.
  const purchaseVisible = useInView(purchaseAction, { amount: 'all', margin: '-180px 0px -90px 0px' });
  const reduced = useReducedMotion();
  let subtotal = 0, discount = 0, totalsInvalid = false;
  try { ({ subtotal, discount } = summarize([{ slug, quantity }],products)); } catch { totalsInvalid = true; }
  async function add() {
    setBusy(true); setMessage("");
    try { await addItems([{ slug, quantity }]); setMessage("Adicionado. Sua combinação está ganhando força."); openCart(); }
    catch { setMessage("Não foi possível adicionar. Tente novamente."); }
    finally { setBusy(false); }
  }
  if (error && !product) return <PageShell title={t('Produto indisponível')}><div role="alert" className="alert"><p>{t(error)}</p><button className="btn btn-secondary" type="button" onClick={() => void refresh()}>{t('Tentar novamente')}</button></div></PageShell>;
  if (loading && !product) return <PageShell title={t('Produtos')}><p role="status">{t('Consultando os sabores e preços…')}</p></PageShell>;
  if (!product?.available) return <PageShell title={t('Sabor indisponível')}><p role="status">{t('Este sabor não está disponível no momento.')}</p><Link className="btn" href={href('/produtos')}>{t('Explorar os outros sabores')}</Link></PageShell>;
  return <main id="conteudo" className={`shell ${styles.detailPage}`} style={{ "--flavor-accent": product.accent, "--flavor-background": product.background } as CSSProperties}>
    {(error || refreshError) && <div role="status" className="alert"><p>{t(error || refreshError)}</p><button className="btn btn-secondary" type="button" onClick={() => void refresh()}>{t('Tentar novamente')}</button></div>}
    <nav className={styles.breadcrumbs} aria-label={t("Caminho da página")}><Link href={href("/")}>{t("Início")}</Link><span>/</span><Link href={href("/produtos")}>{t("Produtos")}</Link><span>/</span><span aria-current="page">{product.name}</span></nav>
    <div className={styles.detailGrid}>
      <header className={styles.detailIntro}>
        <div className={styles.productMeta}><span>Thunder Fang Energy · {product.volumeMl} ml</span></div>
        <h1>{product.name}</h1><p className={styles.detailProfile}>{product.flavorProfile}</p>
        <p className={styles.unitPrice}>{formatPrice(product.priceInCents)} <span>{t("por lata")}</span></p>
      </header>
      <div className={styles.gallery}>
        <div className={styles.galleryFrame}>
          <AnimatePresence initial={false}>{<motion.div className={styles.galleryImage} key={view} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .16 }}>
            {view === "can" ? <Image className={styles.detailCan} src={productArtwork(product.canImage)} alt={`Thunder Fang ${product.name} — ${t("Frente")}`} width={1024} height={1536} priority sizes="(max-width: 760px) 75vw, 300px" /> : <Image className={styles.packImage} src={view === "pack" ? productArtwork(product.image) : product.labelImage} alt={`${product.name} — ${t(view === "pack" ? "Frente e verso" : "Rótulo completo")}`} width={view === "pack" ? 1536 : 1374} height={view === "pack" ? 1024 : 1145} sizes="(max-width: 760px) 95vw, 55vw" />}
          </motion.div>}</AnimatePresence>
        </div>
        <div className={styles.galleryTabs} aria-label={t("Vistas do produto")}>{([ ["can", "Frente"], ["pack", "Frente e verso"], ["label", "Rótulo completo"] ] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{t(label)}</button>)}</div>
        <a className={styles.imageZoom} href={view === 'can' ? productArtwork(product.canImage) : view === 'pack' ? productArtwork(product.image) : product.labelImage} target="_blank" rel="noopener noreferrer">{t('Ampliar imagem')}<span className="sr-only"> — {t('Abre em nova guia')}</span></a>
      </div>
      <div className={styles.detailCopy}>
        <p className={styles.description}>{product.description}</p>
        <QuantityPicker value={quantity} onChange={setQuantity} onValidityChange={setValidQuantity} label={t("Quantidade de latas")} />
        <p className={styles.wholesale}>{t("10% de desconto nos produtos a partir de seis latas, combinando os sabores.")}</p>
        <div className={styles.detailTotal}><span>{t("Total dos produtos")}</span><strong>{totalsInvalid ? t('Reveja a quantidade') : formatPrice(subtotal - discount)}</strong></div>
        {totalsInvalid && <p role="alert" className={styles.error}>{t('Escolha uma quantidade menor para continuar.')}</p>}
        {discount > 0 && <p className={styles.discount}>{t("Desconto de atacado")}: −{formatPrice(discount)}</p>}
        <button ref={purchaseAction} className={styles.primary} type="button" disabled={busy || loading || totalsInvalid || !validQuantity} onClick={add}>{busy ? t("Adicionando…") : t("Adicionar ao carrinho")} <span aria-hidden="true">→</span></button>
        <p role="status" className={styles.status}>{t(message)}</p>
        <p className={styles.note}>{t("Produto conceitual. Sem cobrança ou envio físico.")}</p>
      </div>
    </div>
    <section className={styles.nutrition} aria-labelledby="nutrition-title"><div><h2 id="nutrition-title">{t("Informação nutricional")}</h2><p>{t("Produto conceitual. Informações nutricionais fictícias para demonstração visual.")}</p></div><div className={styles.tableWrap}><table><caption>{t("Valores demonstrativos")}</caption><thead><tr><th scope="col">{t("Informação")}</th><th scope="col">{t("Por 100 ml")}</th><th scope="col">{t("Por 500 ml")}</th></tr></thead><tbody>{nutrition.map(([name, hundred, can]) => <tr key={name}><th scope="row">{t(name)}</th><td>{hundred}</td><td>{can}</td></tr>)}</tbody></table></div></section>
    <Link href={href("/produtos")} className={styles.backLink}>{t("Explorar os outros sabores")} <span aria-hidden="true">→</span></Link>
    <div className={styles.purchaseDock} data-mobile-purchase hidden={purchaseVisible}>
      <div><span>{product.name} · {quantity} {quantity === 1 ? t('lata') : t('latas')}</span><strong>{totalsInvalid || !validQuantity ? t('Reveja a quantidade') : formatPrice(subtotal - discount)}</strong></div>
      <button className={styles.primary} type="button" disabled={busy || loading || totalsInvalid || !validQuantity} onClick={add}>{busy ? t('Adicionando…') : t('Adicionar ao carrinho')}</button>
    </div>
  </main>;
}
