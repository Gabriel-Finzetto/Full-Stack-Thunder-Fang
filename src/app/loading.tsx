'use client';
import { PageShell } from '@/components/ui';
import { useLocale } from '@/i18n/locale-context';
export default function Loading() { const { t } = useLocale(); return <div className="route-loading"><PageShell title={t('Carregando…')}><div className="panel" role="status" aria-busy="true"><p>{t('Carregando…')}</p></div></PageShell></div>; }
