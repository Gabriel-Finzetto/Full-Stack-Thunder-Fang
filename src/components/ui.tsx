'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { formatPrice } from '@/domain/catalog';
import { useLocale } from '@/i18n/locale-context';
import styles from './ui.module.css';

export function Money({ cents }: { cents: number }) { return <>{formatPrice(cents)}</>; }
export function PageShell({ title, description, eyebrow = 'THUNDER FANG ENERGY', children }: { title: string; description?: string; eyebrow?: string; children: ReactNode }) {
  const { t, href } = useLocale();
  return <main id="conteudo" className="shell flow-page"><nav className="breadcrumbs" aria-label={t('Caminho da página')}><Link href={href('/')}>{t('Início')}</Link><span aria-hidden="true">/</span><span aria-current="page">{title}</span></nav><div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>{children}</main>;
}
export function Modal({ open, onClose, title, children, drawer = false, id: dialogId }: { open: boolean; onClose(): void; title: string; children: ReactNode; drawer?: boolean; id?: string }) {
  const [dialog, animate] = useAnimate<HTMLDialogElement>();
  const reducedMotion = useReducedMotion();
  const id = useId(); const [mounted, setMounted] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const backdropPressed = useRef(false);
  const restoreFocus = useCallback(() => {
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected && !document.querySelector('dialog[open]')) target.focus({ preventScroll:true });
  }, []);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    let cancelled = false;
    const offset = drawer ? 'translateX(24px)' : 'translateY(10px)';
    if (open) {
      element.inert = false;
      delete element.dataset.closing;
      if (!element.open) {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        backdropPressed.current = false;
        element.showModal();
        element.style.opacity = reducedMotion ? '1' : '0';
        element.style.transform = reducedMotion ? 'none' : offset;
      }
      const controls = animate(element, { opacity:1, transform:'translate(0px, 0px)' }, { duration:reducedMotion ? 0 : .24, ease:'easeOut' });
      return () => { controls.stop(); };
    }
    if (!element.open) return;
    // Keep the native dialog in the top layer until its exit completes.
    // It continues trapping focus; its closing content cannot be activated.
    element.inert = true;
    element.dataset.closing = 'true';
    const finish = () => {
      if (cancelled) return;
      element.close();
      element.inert = false;
      delete element.dataset.closing;
      element.style.removeProperty('opacity');
      element.style.removeProperty('transform');
      restoreFocus();
    };
    if (reducedMotion) { finish(); return; }
    const controls = animate(element, { opacity:0, transform:offset }, { duration:.18, ease:'easeIn' });
    void controls.then(finish);
    return () => {
      cancelled = true;
      controls.stop();
    };
  }, [open, mounted, drawer, reducedMotion, animate, dialog, restoreFocus]);
  useEffect(() => {
    const element = dialog.current;
    return () => {
      if (element?.open) element.close();
      restoreFocus();
    };
  }, [mounted, dialog, restoreFocus]);
  const outside = (element: HTMLDialogElement, x: number, y: number) => {
    const bounds = element.getBoundingClientRect();
    return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
  };
  if (!mounted) return null;
  return createPortal(<motion.dialog ref={dialog} layoutRoot layoutScroll id={dialogId} className={`${drawer ? 'modal drawer' : 'modal'} ${styles.animatedPanel}`} aria-labelledby={id}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onPointerDown={event => { backdropPressed.current = event.target === event.currentTarget && outside(event.currentTarget,event.clientX,event.clientY); }}
    onPointerCancel={() => { backdropPressed.current = false; }}
    onClick={event => { const close = backdropPressed.current && event.target === event.currentTarget && outside(event.currentTarget,event.clientX,event.clientY); backdropPressed.current = false; if (close) onClose(); }}>
    <div className="modal-heading"><h2 id={id}>{title}</h2><CloseButton onClick={onClose} /></div>{children}</motion.dialog>, document.body);
}
function CloseButton({ onClick }: { onClick(): void }) { const { t } = useLocale(); return <button type="button" className="icon-button" aria-label={t('Fechar')} onClick={onClick}>×</button>; }
export function QuantityControl({ value, onChange, label }: { value: number; onChange(value: number): void; label?: string }) {
  const { t } = useLocale(); const id = useId(); const [error, setError] = useState('');
  return <div className="quantity-field"><label htmlFor={id}>{label ?? t('Quantidade')}</label><div className="quantity-input"><button type="button" disabled={value <= 1} aria-label={t('Diminuir quantidade')} onClick={() => onChange(value - 1)}>−</button><input id={id} inputMode="numeric" value={value} aria-invalid={!!error} aria-describedby={error ? id + '-error' : undefined} onChange={event => { const n = Number(event.target.value); if (/^\d+$/.test(event.target.value) && Number.isSafeInteger(n) && n > 0) { setError(''); onChange(n); } else setError(t('Informe uma quantidade inteira positiva.')); }} /><button type="button" aria-label={t('Aumentar quantidade')} onClick={() => onChange(value + 1)}>+</button></div>{error && <p id={id + '-error'} role="alert">{error}</p>}</div>;
}
