"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/i18n/locale-context";
import styles from "./info-page.module.css";

type InfoPageProps = {
  title: string;
  introduction: string;
  children: ReactNode;
};

export function InfoPage({ title, introduction, children }: InfoPageProps) {
  const { t, href } = useLocale();
  return (
    <main id="conteudo" className={`shell ${styles.page}`}>
      <nav className={styles.breadcrumb} aria-label={t("Caminho da página")}>
        <Link href={href("/")}>{t("Início")}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{t(title)}</span>
      </nav>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>THUNDER FANG ENERGY</p>
        <h1>{t(title)}</h1>
        <p className={styles.introduction}>{t(introduction)}</p>
      </div>
      <div className={styles.content}>{children}</div>
      <Link href={href("/")} className={styles.backLink}>{t("Voltar à home")} <span aria-hidden="true">→</span></Link>
    </main>
  );
}
