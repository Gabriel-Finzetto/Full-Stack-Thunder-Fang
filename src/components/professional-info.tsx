"use client";

import { useLocale } from "@/i18n/locale-context";
import { PageShell } from './ui';
import { SocialLinks } from "./social-links";
import { HelpCenterTrigger } from './help-center';
import styles from './professional-info.module.css';

export function ProfessionalInfo({ kind }: { kind: "social" | "contact" }) {
  const { t } = useLocale();
  return <PageShell title={t(kind === 'social' ? 'Redes sociais' : 'Contato')} description={t('Conheça o trabalho por trás da Thunder Fang Energy.')}>
    <div className={styles.center}>
      <section className={styles.profile} aria-labelledby="professional-title"><div className={styles.avatar} aria-hidden="true">GF</div><p className={styles.role}>{t('Criador do projeto')}</p><h2 id="professional-title">Gabriel Finzetto</h2><p>{t('Acompanhe o desenvolvimento e conheça outros projetos de Gabriel Finzetto.')}</p><SocialLinks /><HelpCenterTrigger tab="messages" className="btn btn-secondary">{t('Enviar uma mensagem')}</HelpCenterTrigger></section>
      <section className={styles.note} aria-labelledby="demo-title"><h2 id="demo-title">{t('Sobre a demonstração')}</h2><p>{t('Thunder Fang Energy é uma marca conceitual de um projeto de portfólio. Nenhuma cobrança ou entrega física é realizada.')}</p><HelpCenterTrigger tab="help">{t('Conhecer o funcionamento da loja')}</HelpCenterTrigger></section>
    </div>
  </PageShell>;
}
