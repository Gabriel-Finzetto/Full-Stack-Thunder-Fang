"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/locale-context";
import { ProductCatalog } from "./product-catalog";
import styles from "./catalog.module.css";

export function CatalogPage() {
  const { t, href } = useLocale();
  return <main id="conteudo" className={`shell ${styles.catalogPage}`}><nav className={styles.breadcrumbs} aria-label={t("Caminho da página")}><Link href={href("/")}>{t("Início")}</Link><span>/</span><span aria-current="page">{t("Produtos")}</span></nav><header className={styles.pageHeading}><p className={styles.eyebrow}>THUNDER FANG ENERGY</p><h1>{t("Quatro sabores. Sua escolha.")}</h1><p>{t("Escolha seus sabores e monte sua combinação.")}</p></header><ProductCatalog showHeading={false} /></main>;
}
