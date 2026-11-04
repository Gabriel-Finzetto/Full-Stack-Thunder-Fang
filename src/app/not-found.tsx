'use client';
import Link from "next/link";
import { useLocale } from '@/i18n/locale-context';

export default function NotFound() {
  const {t,href}=useLocale();
  return <main id="conteudo" className="not-found shell"><p className="eyebrow">404</p><h1>{t('Esse caminho ainda não existe.')}</h1><p>{t('Explore os sabores da Thunder Fang e encontre seu próximo destino.')}</p><Link href={href('/')} className="button button-primary">{t('Voltar ao início')} <span aria-hidden="true">→</span></Link></main>;
}
