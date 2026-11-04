'use client';
import { PageShell } from '@/components/ui';
import { useLocale } from '@/i18n/locale-context';
export default function ErrorPage({ reset }: { reset(): void }) { const { t } = useLocale(); return <PageShell title={t('Não foi possível carregar esta página.')}><div className="alert" role="alert"><p>{t('Tente novamente. Seu carrinho continua no navegador conforme sua validade.')}</p><button className="btn" onClick={reset}>{t('Tentar novamente')}</button></div></PageShell>; }
