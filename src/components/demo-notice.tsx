'use client';
import { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/locale-context';
import { Modal } from './ui';
export function DemoNotice() {
  const { t } = useLocale(); const [open, setOpen] = useState(false);
  useEffect(() => { try { setOpen(localStorage.getItem('tf-demo-notice-v1') !== 'acknowledged'); } catch { setOpen(true); } }, []);
  const acknowledge = () => { try { localStorage.setItem('tf-demo-notice-v1', 'acknowledged'); } catch { /* Remains visible on a future visit when browser storage is unavailable. */ } setOpen(false); };
  return <Modal open={open} onClose={acknowledge} title={t('Loja demonstrativa')}><div className="help-content"><p>{t('Esta experiência faz parte de um portfólio. Use dados fictícios para testar. Não há pagamento ou entrega física.')}</p><button className="btn" onClick={acknowledge} type="button">{t('Entendi, explorar a loja')}</button></div></Modal>;
}
