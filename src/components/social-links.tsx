"use client";

import { useLocale } from "@/i18n/locale-context";
import styles from "./social-links.module.css";

export function SocialLinks({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  return <div className={`${styles.links} ${compact ? styles.compact : ""}`}>
    <a href="https://github.com/Gabriel-Finzetto" target="_blank" rel="noopener noreferrer" aria-label={`GitHub — Gabriel Finzetto — ${t("Abre em nova guia")}`}><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.64-1.33-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.55 9.55 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.35 4.69-4.59 4.94.36.31.68.92.68 1.85v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>{!compact && <><span>GitHub <small>Gabriel-Finzetto</small></span><b aria-hidden="true">↗</b></>}</a>
    <a href="https://www.linkedin.com/in/gabriel-finzetto" target="_blank" rel="noopener noreferrer" aria-label={`LinkedIn — Gabriel Finzetto — ${t("Abre em nova guia")}`}><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.4 7.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM3.8 9h3.2v11.2H3.8V9Zm5.3 0h3.1v1.5c.4-.8 1.5-1.8 3.3-1.8 3.5 0 4.3 2.2 4.3 5.1v6.4h-3.3v-5.7c0-1.4 0-3.2-2-3.2s-2.3 1.5-2.3 3.1v5.8H9.1V9Z" /></svg>{!compact && <><span>LinkedIn <small>Gabriel Finzetto</small></span><b aria-hidden="true">↗</b></>}</a>
  </div>;
}
