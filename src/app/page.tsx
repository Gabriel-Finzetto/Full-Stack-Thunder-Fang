"use client";

import Image from "next/image";
import { canArtwork } from "@/domain/product-artwork";
import Link from "next/link";
import { ProductCatalog } from "@/components/catalog/product-catalog";
import { useLocale } from "@/i18n/locale-context";
import styles from "./home.module.css";

export default function HomePage() {
  const { t, href } = useLocale();
  return <main id="conteudo" className={styles.home}>
    <section className={styles.hero} aria-labelledby="hero-titulo">
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroComposition}>
        <div className={styles.heroCopy}><h1 id="hero-titulo" className={styles.slogan}>
          {t("Entre quem você é e quem pode ser,")}{" "}
          <span>{t("existe uma escolha.")}</span>
        </h1><Link href={href("/#produtos")} className={styles.heroAction}>{t("Escolher sabores")}<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2v13m-5-5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></Link></div>
        <div className={styles.heroCanWrap}>
          <Image className={styles.heroCan} src={canArtwork("original")} alt={t("Lata Thunder Fang Original de 500 ml.")} width={1024} height={1536} sizes="(max-width: 760px) 290px, (max-width: 1200px) 36vw, 430px" priority />
        </div>
      </div>
    </section>
    <section className={styles.products} id="produtos" aria-label={t("Produtos")}>
      <span id="sabores" className={styles.anchor} aria-hidden="true" /><span id="catalogo" className={styles.anchor} aria-hidden="true" />
      <div className="shell"><ProductCatalog orbitPresentation /><div className={styles.allProducts}><Link href={href("/produtos")}>{t("Ver catálogo completo")} <span aria-hidden="true">→</span></Link></div></div>
    </section>
    <section className={styles.concept} id="conceito" aria-labelledby="conceito-titulo">
      <span id="marca" className={styles.anchor} aria-hidden="true" />
      <div className={styles.conceptInner}>
        <div className={styles.conceptVisual}>
          <Image className={styles.bear} src="/images/brand/urso-guerreiro.png" alt={t("Urso polar guerreiro Thunder Fang, com armadura escura e raios turquesa saindo das presas.")} width={1254} height={1254} sizes="(max-width: 900px) 90vw, (max-width: 1300px) 45vw, 560px" />
        </div>
        <div className={styles.conceptCopy}>
          <p className={styles.eyebrow}>{t("O conceito Thunder Fang")}</p>
          <h2 id="conceito-titulo">{t("A força de escolher evoluir.")}</h2>
          <div className={styles.conceptText}>
            <p>{t("Thunder Fang parte da ideia de que evoluir começa por uma escolha: sair do automático e assumir o próprio caminho. A marca transforma essa atitude em uma identidade intensa, feita para quem encara desafios com personalidade.")}</p>
            <p>{t("O urso branco traduz força e presença. A armadura de aço escuro representa preparo e resistência, enquanto as presas expressam determinação. Os raios que partem delas dão forma ao impulso de agir e conectam o personagem ao nome da marca: Thunder, o trovão, e Fang, a presa.")}</p>
            <p>{t("Essa união entre proteção e movimento dá sentido à nossa proposta: encarar o próximo desafio com intenção. A evolução se constrói nas escolhas de todos os dias, e é essa atitude que a Thunder Fang representa.")}</p>
          </div>
        </div>
      </div>
    </section>
  </main>;
}
