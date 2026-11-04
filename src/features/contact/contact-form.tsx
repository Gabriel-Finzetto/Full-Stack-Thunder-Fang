"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageShell } from "@/components/ui";
import { useLocale } from "@/i18n/locale-context";
import styles from "./contact.module.css";

const reasons = [
  ["products", "Produtos e sabores"],
  ["order", "Pedido demonstrativo"],
  ["partnerships", "Parcerias"],
  ["other", "Outro assunto"],
] as const;

type ContactFields = { name: string; email: string; reason: string; message: string };
type ContactErrors = Partial<Record<keyof ContactFields, string>>;

export function validateContact(fields: ContactFields): ContactErrors {
  const errors: ContactErrors = {};
  if (!fields.name.trim()) errors.name = "Informe seu nome.";
  else if (fields.name.length > 120) errors.name = "Use até 120 caracteres no nome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim()) || fields.email.length > 254) errors.email = "Informe um e-mail válido.";
  if (!reasons.some(([value]) => value === fields.reason)) errors.reason = "Selecione o motivo do contato.";
  if (!fields.message.trim()) errors.message = "Escreva sua mensagem.";
  else if (fields.message.length > 3000) errors.message = "Use até 3.000 caracteres na mensagem.";
  return errors;
}

export function BrandContact({ recipientEmail }: { recipientEmail?: string }) {
  const { t } = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<ContactErrors>({});
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { const active = request.current; request.current = null; active?.abort(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const submittedForm = event.currentTarget;
    setFeedback("");
    const values = new FormData(event.currentTarget);
    const fields: ContactFields = {
      name: String(values.get("name") ?? ""),
      email: String(values.get("email") ?? ""),
      reason: String(values.get("reason") ?? ""),
      message: String(values.get("message") ?? ""),
    };
    const nextErrors = validateContact(fields);
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fields.name.trim(), email: fields.email.trim(), reason: fields.reason, message: fields.message.trim() }), signal: controller.signal,
      });
      if (response.status === 429) { setFeedback('Muitas solicitações. Aguarde antes de enviar novamente.'); return; }
      const data: unknown = await response.json();
      if (response.status !== 202 || !data || typeof data !== 'object' || !('accepted' in data) || data.accepted !== true
        || !('messageId' in data) || typeof data.messageId !== 'string' || !data.messageId.trim()) throw new Error('CONTACT_NOT_CONFIRMED');
      submittedForm.reset();
      setErrors({});
      setFeedback('Sua mensagem foi aceita para envio. Obrigado pelo contato.');
    } catch {
      if (request.current === controller) setFeedback('Não foi possível confirmar o envio. Seus campos foram preservados. Confira antes de tentar novamente para evitar mensagens repetidas.');
    } finally {
      window.clearTimeout(timeout);
      pending.current = false;
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }

  const errorProps = (field: keyof ContactFields) => ({
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field] ? `contact-${field}-error` : undefined,
  });
  const error = (field: keyof ContactFields) => errors[field] ? <span className={styles.error} id={`contact-${field}-error`}>{t(errors[field]!)}</span> : null;
  const clearFeedback = () => { if (feedback) setFeedback(""); };

  return <PageShell title={t("Fale com a Thunder Fang")} description={t("Uma dúvida sobre os sabores, uma ideia ou uma parceria? Conte para a gente.")}>
    <div className={styles.layout}>
      <aside className={styles.introduction}>
        <span className={styles.label}>THUNDER FANG ENERGY</span>
        <h2>{t("Sua mensagem tem espaço aqui.")}</h2>
        <p>{t("Escolha o assunto, deixe um e-mail para retorno e escreva o que deseja compartilhar com a marca.")}</p>
        <div className={styles.contactDetail}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.4" /></svg>
          <div><h3>{t("Contato com a marca")}</h3>{recipientEmail ? <a href={`mailto:${recipientEmail}`}>{recipientEmail}</a> : <p>{t("Use o formulário para preparar sua mensagem.")}</p>}</div>
        </div>
        <p className={styles.demoNote}>{t("Thunder Fang Energy é uma marca conceitual de um projeto de portfólio. Nenhuma cobrança ou entrega física é realizada.")}</p>
      </aside>

      <section className={styles.formPanel} aria-labelledby="contact-form-title">
        <div className={styles.formHeading}><h2 id="contact-form-title">{t("Como podemos ajudar?")}</h2><p>{t("Todos os campos são obrigatórios.")}</p></div>
        <form ref={form} onSubmit={submit} onChange={clearFeedback} noValidate aria-busy={busy}>
          <div className={styles.fields}>
            <label className={styles.field} htmlFor="contact-name">{t("Nome")}<input id="contact-name" name="name" autoComplete="name" required disabled={busy} maxLength={120} {...errorProps("name")} />{error("name")}</label>
            <label className={styles.field} htmlFor="contact-email">{t("E-mail")}<input id="contact-email" name="email" type="email" inputMode="email" autoComplete="email" required disabled={busy} maxLength={254} {...errorProps("email")} />{error("email")}</label>
            <label className={`${styles.field} ${styles.wide}`} htmlFor="contact-reason">{t("Motivo do contato")}<select id="contact-reason" name="reason" required disabled={busy} defaultValue="" {...errorProps("reason")}><option value="" disabled>{t("Selecione um assunto")}</option>{reasons.map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}</select>{error("reason")}</label>
            <label className={`${styles.field} ${styles.wide}`} htmlFor="contact-message">{t("Mensagem")}<textarea id="contact-message" name="message" required disabled={busy} maxLength={3000} rows={7} {...errorProps("message")} />{error("message")}<span className={styles.helper}>{t("Até 3.000 caracteres. Nesta demonstração, use dados fictícios.")}</span></label>
          </div>
          <div className={styles.submitRow}><button className="btn" type="submit" disabled={busy}>{t(busy ? 'Enviando…' : "Enviar mensagem")} <span aria-hidden="true">→</span></button><p>{t("Sua mensagem será encaminhada à equipe da Thunder Fang.")}</p></div>
          {feedback && <p className={styles.feedback} role="status">{t(feedback)}</p>}
        </form>
      </section>
    </div>
  </PageShell>;
}
