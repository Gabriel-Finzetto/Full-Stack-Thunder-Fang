"use client";

import Link from "next/link";
import Image from "next/image";
import { useLocale } from "@/i18n/locale-context";
import { HelpCenterTrigger } from './help-center';
import { SocialLinks } from "./social-links";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  const { t, href } = useLocale();
  return <footer className={styles.footer}><div className={`shell ${styles.inner}`}>
    <div className={styles.identity}><Link href={href("/")} className={styles.wordmark} aria-label={t("Thunder Fang Energy — início")}><Image src="/images/brand/lettering-footer.png" alt="" width={1200} height={400} sizes="220px" /></Link><p>{t("Marca conceitual. Uma experiência demonstrativa de e-commerce.")}</p></div>
    <nav className={styles.links} aria-label={t("Informações da Thunder Fang")}><HelpCenterTrigger tab="messages" className={styles.helpLink}>{t("Ajuda e contato")}</HelpCenterTrigger><Link href={href("/redes-sociais")}>{t("Redes sociais")}</Link><SocialLinks compact /></nav>
    <div className={styles.bottom}><p>{t("Portfolio demo · Sem cobrança ou envio de produtos.")}</p><div className={styles.projectLinks}><a href="https://github.com/Gabriel-Finzetto/Full-Stack-Thunder-Fang" target="_blank" rel="noopener noreferrer" aria-label={`${t("Repositório do projeto")} — ${t("Abre em nova guia")}`}>{t("Repositório do projeto")} <span aria-hidden="true">↗</span></a></div></div>
  </div></footer>;
}
