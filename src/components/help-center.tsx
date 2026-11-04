'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useAccount } from '@/features/account/account-context';
import { validateContact } from '@/features/contact/contact-form';
import { useLocale } from '@/i18n/locale-context';
import { SocialLinks } from './social-links';
import { helpArticles } from './help-content';
import styles from './help-center.module.css';

type HelpTab = 'home' | 'messages' | 'help';
const openEvent = 'tf:open-help-center';
const tabs: { id: HelpTab; label: string }[] = [{ id: 'home', label: 'Início' }, { id: 'messages', label: 'Mensagens' }, { id: 'help', label: 'Ajuda' }];

function TabIcon({ tab }: { tab: HelpTab }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tab === 'home' ? <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></> : tab === 'messages' ? <path d="M20 4H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4l4 3v-3h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1ZM7 8h10M7 12h7" /> : <><path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4ZM12 5v15" /></>}</svg>;
}

export function HelpCenterTrigger({ tab = 'home', children, className }: { tab?: HelpTab; children: ReactNode; className?: string }) {
  return <button type="button" className={className ?? styles.inlineTrigger} onClick={() => window.dispatchEvent(new CustomEvent(openEvent, { detail: tab }))}>{children}</button>;
}

export function HelpCenter() {
  const { user } = useAccount();
  // Private message drafts and receipts belong only to this identity and this visit.
  return <HelpCenterPanel key={user?.id ?? 'visitor'} />;
}

function HelpCenterPanel() {
  const { t, href } = useLocale();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HelpTab>('home');
  const [articleId, setArticleId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const id = useId();
  const show = useCallback((nextTab: HelpTab) => {
    if (!dialog.current?.open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : launcher.current;
    setTab(nextTab); setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    const target = opener.current ?? launcher.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
    opener.current = null;
  }, []);
  useEffect(() => {
    const receive = (event: Event) => { const next = (event as CustomEvent<unknown>).detail; show(next === 'messages' || next === 'help' ? next : 'home'); };
    window.addEventListener(openEvent, receive);
    if (new URLSearchParams(window.location.search).get('ajuda') === 'mensagens') show('messages');
    return () => window.removeEventListener(openEvent, receive);
  }, [show]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) { element.show(); element.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }
    if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    // Disabled controls can return focus to the document during an async send.
    // Escape still closes this nonmodal panel, unless a true modal is above it.
    const dismiss = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog:modal')) return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open, close]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [tab, articleId]);
  const article = helpArticles.find(item => item.id === articleId);
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
  const needle = normalize(query.trim());
  const filtered = helpArticles.filter(item => !needle || normalize([item.category, item.title, item.body, item.technical].map(t).join(' ')).includes(needle));
  const categories = [...new Set(filtered.map(item => item.category))];
  const read = (nextId: string) => { setArticleId(nextId); setTab('help'); };
  const tabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault(); setTab(tabs[next].id); document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
  };
  return <>
    <button ref={launcher} type="button" className={styles.launcher} aria-label={t(open ? 'Fechar central de ajuda' : 'Abrir central de ajuda')} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => open ? close() : show('home')}><TabIcon tab="messages" />{t('Ajuda e contato')}</button>
    <dialog ref={dialog} id={id} className={styles.panel} aria-modal="false" aria-label={t('Central Thunder Fang')} onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <header className={styles.heading}><div className={styles.brand}><span className={styles.mark} aria-hidden="true">TF</span><div><strong>Thunder Fang</strong><small>{t('Ajuda e contato')}</small></div></div><button className={styles.close} type="button" aria-label={t('Fechar central de ajuda')} onClick={close}>×</button></header>
      <div ref={scroller} className={styles.content}>
        <section id={`${id}-panel-home`} role="tabpanel" aria-labelledby={`${id}-tab-home`} hidden={tab !== 'home'} tabIndex={0} className={styles.home}>
          <h2>{t('Olá. Como podemos ajudar?')}</h2><p className={styles.intro}>{t('Explore a loja, encontre uma orientação ou envie sua mensagem para a Thunder Fang.')}</p>
          <div className={styles.actionList}>
            <button type="button" onClick={() => setTab('messages')}><span>{t('Enviar uma mensagem')}<small>{t('A resposta chega ao seu e-mail.')}</small></span><b aria-hidden="true">›</b></button>
            <button type="button" onClick={() => { setArticleId(null); setTab('help'); }}><span>{t('Instruções e dúvidas')}<small>{t('Conta, pedidos, entrega e funcionamento da loja.')}</small></span><b aria-hidden="true">›</b></button>
            <Link href={href('/conta#meus-pedidos')} onClick={close}><span>{t('Meus pedidos')}<small>{t('Consulte sua conta e acompanhe suas combinações.')}</small></span><b aria-hidden="true">›</b></Link>
          </div>
          <h3 className={styles.sectionTitle}>{t('Para começar')}</h3>
          <button className={styles.articleButton} type="button" onClick={() => read('first-steps')}>{t('Como explorar a loja')}<span aria-hidden="true">›</span></button>
          <button className={styles.articleButton} type="button" onClick={() => read('project')}>{t('Como esta central funciona')}<span aria-hidden="true">›</span></button>
          <h3 className={styles.sectionTitle}>{t('Por trás do projeto')}</h3><p className={styles.muted}>{t('Conheça o trabalho de Gabriel Finzetto.')}</p><SocialLinks /><Link className={styles.plainLink} href={href('/redes-sociais')} onClick={close}>{t('Ver perfil profissional')}</Link>
        </section>
        <section id={`${id}-panel-messages`} role="tabpanel" aria-labelledby={`${id}-tab-messages`} hidden={tab !== 'messages'} tabIndex={0}><ContactMessages active={open && tab === 'messages'} /></section>
        <section id={`${id}-panel-help`} role="tabpanel" aria-labelledby={`${id}-tab-help`} hidden={tab !== 'help'} tabIndex={0}>
          {article ? <article className={styles.article}><button className={styles.back} type="button" onClick={() => setArticleId(null)}><span aria-hidden="true">‹</span>{t('Todas as instruções')}</button><h2>{t(article.title)}</h2><p>{t(article.body)}</p><details><summary>{t('Entenda como funciona')}</summary><p>{t(article.technical)}</p></details><button className={styles.plainLink + ' ' + styles.inlineTrigger} type="button" onClick={() => setTab('messages')}>{t('Ainda preciso de ajuda')}</button></article> : <><label className={styles.search} htmlFor={`${id}-search`}>{t('Pesquisar na ajuda')}<input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Busque uma dúvida ou assunto')} /></label>{categories.map(category => <section key={category} className={styles.articleGroup}><h3>{t(category)}</h3>{filtered.filter(item => item.category === category).map(item => <button key={item.id} className={styles.articleButton} type="button" onClick={() => read(item.id)}>{t(item.title)}<span aria-hidden="true">›</span></button>)}</section>)}{!filtered.length && <p className={styles.empty} role="status">{t('Nenhum artigo encontrado. Tente outro termo ou envie uma mensagem.')}</p>}</>}
        </section>
      </div>
      <nav className={styles.tabs} role="tablist" aria-label={t('Seções da central')}>{tabs.map((item, index) => <button key={item.id} id={`${id}-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`${id}-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => tabKey(event, index)}><TabIcon tab={item.id} />{t(item.label)}</button>)}</nav>
    </dialog>
  </>;
}

type ContactFields = { name: string; email: string; reason: string; message: string };
type Receipt = { id: string; message: string; email: string; date: string };
function ContactMessages({ active }: { active: boolean }) {
  const { t, locale } = useLocale();
  const { user } = useAccount();
  const [fields, setFields] = useState<ContactFields>({ name: user?.name ?? '', email: user?.email ?? '', reason: '', message: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFields, string>>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const request = useRef<AbortController | null>(null);
  const receiptHeading = useRef<HTMLElement>(null);
  const feedbackElement = useRef<HTMLParagraphElement>(null);
  const focusResult = useRef<'receipt' | 'feedback' | null>(null);
  const id = useId();
  useEffect(() => () => { const controller = request.current; request.current = null; controller?.abort(); }, []);
  useEffect(() => {
    if (!active || busy || !feedback || !focusResult.current) return;
    const target = focusResult.current === 'receipt' ? receiptHeading.current : feedbackElement.current;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
    focusResult.current = null;
  }, [active, busy, feedback, receipts.length]);
  const change = (field: keyof ContactFields, value: string) => { setFields(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: undefined })); setFeedback(''); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    const validation = validateContact(fields); setErrors(validation); setFeedback(''); focusResult.current = null;
    const first = Object.keys(validation)[0];
    if (first) { form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/contact', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: fields.name.trim(), email: fields.email.trim(), reason: fields.reason, message: fields.message.trim() }), signal: controller.signal });
      if (request.current !== controller) return;
      if (response.status === 429) { focusResult.current = 'feedback'; setFeedback('Muitas solicitações. Aguarde antes de enviar novamente.'); return; }
      const data: unknown = await response.json();
      if (response.status !== 202 || !data || typeof data !== 'object' || !('accepted' in data) || data.accepted !== true || !('messageId' in data) || typeof data.messageId !== 'string' || !data.messageId.trim() || data.messageId.length > 1024) throw new Error('CONTACT_NOT_CONFIRMED');
      if (request.current !== controller) return;
      focusResult.current = 'receipt';
      setReceipts(current => [...current.slice(-4), { id: data.messageId as string, message: fields.message.trim(), email: fields.email.trim(), date: new Date().toISOString() }]);
      setFields(current => ({ ...current, message: '' })); setErrors({}); setFeedback('Sua mensagem foi aceita para envio. Obrigado pelo contato.');
    } catch { if (request.current === controller) { focusResult.current = 'feedback'; setFeedback('Não foi possível confirmar o envio. Seus campos foram preservados. Confira antes de tentar novamente para evitar mensagens repetidas.'); } }
    finally { window.clearTimeout(timeout); if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  const invalid = (field: keyof ContactFields) => ({ 'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined });
  const error = (field: keyof ContactFields) => errors[field] ? <span className={styles.error} id={`${id}-${field}-error`}>{t(errors[field]!)}</span> : null;
  return <>
    <div className={styles.welcome}><strong>Thunder Fang</strong><p>{t('Boas-vindas à nossa loja. Envie sua dúvida, ideia ou proposta por aqui. Vamos responder no e-mail que você informar.')}</p><small>{t('Mensagem de boas-vindas automática. Retorno por e-mail.')}</small></div>
    {receipts.map((receipt, index) => <article key={`${receipt.id}-${index}`} className={styles.receipt}><strong ref={index === receipts.length - 1 ? receiptHeading : undefined} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true">{t('Aceita para envio')}</strong><p>{receipt.message}</p><time dateTime={receipt.date}>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(receipt.date))}</time><small>{t('E-mail para retorno')}: {receipt.email}</small><details><summary>{t('Comprovante do envio')}</summary><small>{receipt.id}</small><small>{t('A aceitação não confirma a entrega à caixa de entrada.')}</small></details></article>)}
    <form ref={form} className={styles.form} onSubmit={submit} noValidate aria-busy={busy}>
      <label htmlFor={`${id}-name`}>{t('Nome')}<input id={`${id}-name`} name="name" autoComplete="name" value={fields.name} onChange={event => change('name', event.target.value)} required maxLength={120} disabled={busy} {...invalid('name')} />{error('name')}</label>
      <label htmlFor={`${id}-email`}>{t('E-mail para retorno')}<input id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" value={fields.email} onChange={event => change('email', event.target.value)} required maxLength={254} disabled={busy} {...invalid('email')} />{error('email')}</label>
      <label htmlFor={`${id}-reason`}>{t('Motivo do contato')}<select id={`${id}-reason`} name="reason" value={fields.reason} onChange={event => change('reason', event.target.value)} required disabled={busy} {...invalid('reason')}><option value="" disabled>{t('Selecione um assunto')}</option>{[['products', 'Produtos e sabores'], ['order', 'Pedido demonstrativo'], ['partnerships', 'Parcerias'], ['other', 'Outro assunto']].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>{error('reason')}</label>
      <label htmlFor={`${id}-message`}>{t('Mensagem')}<textarea id={`${id}-message`} name="message" rows={5} value={fields.message} onChange={event => change('message', event.target.value)} required maxLength={3000} disabled={busy} {...invalid('message')} />{error('message')}<span className={styles.muted}>{t('Até 3.000 caracteres. Nesta demonstração, use dados fictícios.')}</span></label>
      <button className="btn" type="submit" disabled={busy}>{t(busy ? 'Enviando…' : 'Enviar mensagem')}</button>
      {feedback && <p ref={feedbackElement} className={styles.feedback} role="status" aria-live="polite" tabIndex={-1}>{t(feedback)}</p>}
      <p className={styles.muted}>{t('Seus rascunhos e comprovantes ficam disponíveis somente nesta visita e são limpos ao trocar de conta ou recarregar a página.')}</p>
    </form>
  </>;
}
