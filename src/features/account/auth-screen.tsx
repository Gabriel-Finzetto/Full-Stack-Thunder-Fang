"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PageShell } from "@/components/ui";
import { useLocale } from "@/i18n/locale-context";
import { authErrorMessage, authRedirect, getAuthClient, safeReturn } from "./auth-client";
import { confirmationDestination, emailReturn } from './auth-navigation';
import { useAccount } from "./account-context";
import { canContinueConfirmation, confirmationIsActive } from "./pending-confirmation";
import styles from "./account.module.css";

type AuthKind = "login" | "cadastro" | "recuperar" | "redefinir" | "confirmar";
const titles: Record<AuthKind, string> = { login: "Entre na sua conta", cadastro: "Crie sua conta", recuperar: "Recupere sua senha", redefinir: "Defina uma nova senha", confirmar: "Confirme seu e-mail" };

function requestErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return authErrorMessage(undefined);
  return authErrorMessage({
    code: "code" in error && typeof error.code === "string" ? error.code : undefined,
    status: "status" in error && typeof error.status === "number" ? error.status : undefined,
  });
}

function PasswordField({ name, label, confirmation = false, current = false, error, hint, disabled = false }: { name: string; label: string; confirmation?: boolean; current?: boolean; error?: string; hint?: string; disabled?: boolean }) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className={styles.field}><label htmlFor={id}>{t(label)}</label><div className={styles.password}><input id={id} name={name} type={visible ? "text" : "password"} required disabled={disabled} autoComplete={current && !confirmation ? "current-password" : "new-password"} maxLength={256} aria-invalid={Boolean(error)} aria-describedby={describedBy} /><button type="button" disabled={disabled} aria-pressed={visible} aria-label={t(visible ? "Ocultar senha" : "Mostrar senha")} onClick={() => setVisible(!visible)}>{t(visible ? "Ocultar" : "Mostrar")}</button></div>{hint && <p id={`${id}-hint`} className={styles.passwordHint}>{t(hint)}</p>}{error && <span id={`${id}-error`} className={styles.error}>{t(error)}</span>}</div>;
}

export function AuthScreen({ kind }: { kind: AuthKind }) {
  const { locale, t, href } = useLocale();
  const router = useRouter();
  const { pendingConfirmation, awaitConfirmation, clearPendingConfirmation, refreshProfile, user, ready, error: accountError } = useAccount();
  const continuing = useRef(false);
  const [response, setResponse] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [returnTo, setReturnTo] = useState(kind === 'cadastro' || kind === 'confirmar' ? confirmationDestination : '/conta');
  const [emailState, setEmailState] = useState("aguardando");
  const [busy, setBusy] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [recoveryState, setRecoveryState] = useState<"checking" | "allowed" | "invalid">("checking");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requestedReturn = query.get("retorno") ?? query.get("next");
    setReturnTo(kind === 'cadastro' || kind === 'confirmar' ? emailReturn(requestedReturn, 'confirm') : safeReturn(requestedReturn));
    const status = query.get("estado");
    setEmailState(status && ["aguardando", "invalido", "expirado", "sessao-ausente", "sessao-expirada", "senha-atualizada", "confirmado"].includes(status) ? status : "aguardando");
    setResponse("");
    setErrors({});
    setConfirmationRequired(false);
    if (kind === "confirmar" && status === "confirmado") {
      const controller = new AbortController();
      setEmailState("aguardando");
      fetch("/api/profile", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
        .then(result => {
          if (controller.signal.aborted) return;
          setEmailState(result.ok ? "confirmado" : "invalido");
          if (result.ok) { router.replace(href(confirmationDestination)); router.refresh(); }
        })
        .catch(() => { if (!controller.signal.aborted) setEmailState("invalido"); });
      return () => controller.abort();
    }
    if (kind !== "redefinir") return;
    setRecoveryState("checking");
    const controller = new AbortController();
    fetch("/api/auth/recovery", { cache: "no-store", signal: controller.signal })
      .then(async result => {
        if (!result.ok) throw new Error("RECOVERY_UNAVAILABLE");
        const data: unknown = await result.json();
        if (!controller.signal.aborted) setRecoveryState(data && typeof data === "object" && "allowed" in data && data.allowed === true ? "allowed" : "invalid");
      })
      .catch(() => { if (!controller.signal.aborted) setRecoveryState("invalid"); });
    return () => controller.abort();
  }, [kind, href, router]);

  useEffect(() => {
    if (kind !== "confirmar" || !pendingConfirmation) return;
    let stopped = false;
    let checking = false;
    const check = async () => {
      if (stopped || checking || document.visibilityState !== "visible") return;
      if (!confirmationIsActive(pendingConfirmation)) { clearPendingConfirmation(); return; }
      checking = true;
      try { await refreshProfile(); } finally { checking = false; }
    };
    // Server callbacks in another tab can change cookies without an SDK event
    // in this tab. Reconcile only while this specific registration is waiting.
    const interval = window.setInterval(() => { void check(); }, 5000);
    const focus = () => { void check(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [kind, pendingConfirmation, refreshProfile, clearPendingConfirmation]);

  useEffect(() => {
    if (kind !== "confirmar") { continuing.current = false; return; }
    if (continuing.current || !ready || accountError || !canContinueConfirmation(pendingConfirmation, user?.id)) return;
    continuing.current = true;
    clearPendingConfirmation();
    router.replace(href(confirmationDestination));
    router.refresh();
  }, [kind, pendingConfirmation, user?.id, ready, accountError, clearPendingConfirmation, href, router]);

  const returnQuery = `?retorno=${encodeURIComponent(returnTo)}`;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setResponse("");
    setConfirmationRequired(false);
    const form = event.currentTarget;
    const values = new FormData(form);
    const nextErrors: Record<string, string> = {};
    const email = String(values.get("email") ?? "").trim();
    const name = String(values.get("name") ?? "").trim();
    const password = String(values.get("password") ?? "");
    const confirmation = String(values.get("confirmation") ?? "");
    if (kind === "cadastro" && !name) nextErrors.name = "Informe seu nome completo.";
    if (kind !== "redefinir" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "Informe um e-mail válido.";
    if (["login", "cadastro", "redefinir"].includes(kind) && !password) nextErrors.password = "Informe sua senha.";
    if (["cadastro", "redefinir"].includes(kind) && password && password.length < 8) nextErrors.password = "Sua senha deve ter pelo menos 8 caracteres.";
    if (["cadastro", "redefinir"].includes(kind) && password !== confirmation) nextErrors.confirmation = "As senhas precisam ser iguais.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { form.querySelector<HTMLInputElement>(`[name="${Object.keys(nextErrors)[0]}"]`)?.focus(); return; }
    if (kind === "redefinir" && recoveryState !== "allowed") { setResponse("Este link é inválido ou expirou. Solicite outro link."); return; }
    setBusy(true);
    try {
      const client = getAuthClient();
      if (kind === "login") {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) { if (error.code === "email_not_confirmed") setConfirmationRequired(true); throw error; }
        if (!data.user?.email_confirmed_at) {
          await client.auth.signOut({ scope: "local" });
          setConfirmationRequired(true);
          setResponse("Confirme seu e-mail antes de entrar.");
          return;
        }
        form.reset();
        window.dispatchEvent(new Event("thunderfang:sessionchange"));
        router.replace(href(safeReturn(returnTo)));
        router.refresh();
      } else if (kind === "cadastro") {
        const { data, error } = await client.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: authRedirect(locale, returnTo, "confirm") } });
        if (error) throw error;
        awaitConfirmation(data.user?.id);
        form.reset();
        router.replace(href(`/confirmar-email${returnQuery}`));
      } else if (kind === "recuperar") {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: authRedirect(locale, returnTo, "recovery") });
        if (error) throw error;
        setResponse("Se houver uma conta com este e-mail, a solicitação de recuperação será processada. Confira sua caixa de entrada e o spam.");
      } else if (kind === "confirmar") {
        const { error } = await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: authRedirect(locale, returnTo, "confirm") } });
        if (error) throw error;
        setResponse("Se este cadastro precisar de confirmação, a solicitação foi recebida. Confira o e-mail e a pasta de spam.");
      } else {
        const result = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ password, confirmation }) });
        const data: unknown = await result.json();
        if (!result.ok) {
          if ([401, 403, 410].includes(result.status)) { setRecoveryState("invalid"); setResponse("Este link é inválido ou expirou. Solicite outro link."); }
          else if (result.status === 429) setResponse("Aguarde antes de tentar novamente.");
          else if (data && typeof data === "object" && "message" in data && typeof data.message === "string" && ["Escolha uma senha diferente da anterior.", "A senha não atende aos requisitos de segurança.", "Sua senha deve ter pelo menos 8 caracteres."].includes(data.message)) setResponse(data.message);
          else setResponse("Não foi possível concluir a solicitação. Tente novamente.");
          return;
        }
        if (!data || typeof data !== "object" || !("updated" in data) || data.updated !== true) throw new Error("INVALID_PASSWORD_RESPONSE");
        form.reset();
        try { await client.auth.signOut({ scope: "local" }); } catch { /* The server already confirmed the password change. */ }
        window.dispatchEvent(new Event("thunderfang:sessionchange"));
        router.replace(href(`/login?estado=senha-atualizada&retorno=${encodeURIComponent(returnTo)}`));
        router.refresh();
      }
    } catch (error) { setResponse(requestErrorMessage(error)); }
    finally { setBusy(false); }
  };

  const confirmed = kind === "confirmar" && emailState === "confirmado";
  const missingSession = kind === "confirmar" && emailState === "sessao-ausente";
  const confirmationDescription = confirmed ? "Seu e-mail foi confirmado. Continue para acessar sua conta." : missingSession ? "Este link não conseguiu iniciar sua sessão neste navegador. Entre com sua senha para continuar." : emailState === "invalido" ? "Este link de confirmação é inválido. Solicite um novo link para continuar." : emailState === "expirado" ? "Este link de confirmação expirou. Solicite um novo link para continuar." : "Depois do cadastro, você receberá um link para confirmar seu endereço de e-mail.";
  const resetDisabled = kind === "redefinir" && recoveryState !== "allowed";
  const accessNotice = kind === "login" ? "Entre com seu e-mail e senha para acessar seus pedidos." : kind === "cadastro" ? "Crie sua conta e confirme o e-mail para salvar pedidos demonstrativos." : kind === "recuperar" ? "Informe o e-mail da sua conta para receber um link de recuperação." : kind === "redefinir" ? "Escolha uma nova senha usando o link de recuperação." : confirmed ? "Você já pode continuar com sua conta." : missingSession ? "Entre com sua conta para continuar." : "Confirme seu e-mail para acessar a conta e consultar seus dados com privacidade.";

  return <PageShell eyebrow="THUNDER FANG ENERGY" title={t(confirmed ? "E-mail confirmado" : missingSession ? "Entre para continuar" : titles[kind])} description={t(kind === "confirmar" ? confirmationDescription : "Sua conta acompanha sua experiência na loja demonstrativa.")}>
    <div className={styles.narrow}>
      <div className={styles.notice}>{t(accessNotice)}</div>
      {emailState === "sessao-expirada" && <p className={styles.response} role="status">{t("Sua sessão expirou. Entre novamente para continuar de onde parou.")}</p>}
      {kind === "login" && emailState === "senha-atualizada" && <p className={styles.response} role="status">{t("Senha atualizada. Entre novamente com sua nova senha.")}</p>}
      {kind === "redefinir" && recoveryState === "checking" && <p className={styles.response} role="status">{t("Verificando o link de recuperação…")}</p>}
      {kind === "redefinir" && recoveryState === "invalid" && <p className={styles.response} role="status">{t("Este link é inválido ou expirou. Solicite outro link.")} <Link className={styles.inlineLink} href={href(`/recuperar-senha${returnQuery}`)}>{t("Solicitar recuperação")}</Link></p>}
      {kind === "confirmar" ? <section className={styles.block} aria-label={t("Confirmação de e-mail")}>
        <div className={styles.statusIcon} aria-hidden="true">@</div>
        <h2>{t(confirmed ? "E-mail confirmado" : missingSession ? "Entre para continuar" : emailState === "invalido" ? "Link inválido" : emailState === "expirado" ? "Link expirado" : "Aguardando confirmação")}</h2>
        <p className={styles.muted}>{t(confirmationDescription)}</p>
        {confirmed ? <div className={styles.actions}><Link className="btn" href={href(safeReturn(returnTo))}>{t("Continuar")}</Link></div> : missingSession ? <div className={styles.actions}><Link className="btn" href={href(`/login${returnQuery}`)}>{t("Entrar e continuar")}</Link><Link className="btn btn-secondary" href={href(`/recuperar-senha${returnQuery}`)}>{t("Esqueci minha senha")}</Link></div> : <>
        <p className={styles.helper}>{t("Não recebeu? Confira a pasta de spam. Para solicitar outro link, informe o e-mail do cadastro.")}</p>
        <form className={styles.form} onSubmit={submit} noValidate aria-busy={busy}>
          <div className={styles.field}><label htmlFor="confirmation-email">{t("E-mail do cadastro")}</label><input id="confirmation-email" type="email" name="email" autoComplete="email" inputMode="email" required maxLength={254} disabled={busy} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "confirmation-email-error" : undefined} />{errors.email && <span id="confirmation-email-error" className={styles.error}>{t(errors.email)}</span>}</div>
          <div className={styles.actions}><button className="btn" type="submit" disabled={busy}>{t(busy ? "Verificando…" : "Reenviar confirmação")}</button><Link className="btn btn-secondary" href={href(`/cadastro${returnQuery}`)}>{t("Corrigir cadastro")}</Link></div>
        </form></>}
      </section> : <section className={styles.block}>
        {kind === "redefinir" && <p className={styles.helper}>{t("A redefinição só será concluída com um link válido do serviço de autenticação.")}</p>}
        <form className={styles.form} onSubmit={submit} noValidate aria-busy={busy}>
          {kind === "cadastro" && <div className={styles.field}><label htmlFor="account-name">{t("Nome completo")}</label><input id="account-name" name="name" autoComplete="name" required maxLength={120} disabled={busy} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} />{errors.name && <span id="name-error" className={styles.error}>{t(errors.name)}</span>}</div>}
          {kind !== "redefinir" && <div className={styles.field}><label htmlFor="account-email">{t("E-mail")}</label><input id="account-email" type="email" name="email" autoComplete="email" inputMode="email" required maxLength={254} disabled={busy} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />{errors.email && <span id="email-error" className={styles.error}>{t(errors.email)}</span>}</div>}
          {kind !== "recuperar" && <PasswordField name="password" label={kind === "redefinir" ? "Nova senha" : "Senha"} current={kind === "login"} hint={kind === "cadastro" || kind === "redefinir" ? "Mínimo de 8 caracteres." : undefined} error={errors.password} disabled={busy || resetDisabled} />}
          {["cadastro", "redefinir"].includes(kind) && <PasswordField name="confirmation" label="Confirme a senha" confirmation error={errors.confirmation} disabled={busy || resetDisabled} />}
          {kind === "cadastro" && <p className={styles.helper}>{t("O cadastro será liberado após a confirmação do e-mail. Nenhuma cobrança ou envio físico será realizado.")}</p>}
          <button className="btn" type="submit" disabled={busy || resetDisabled}>{t(busy ? "Verificando…" : kind === "login" ? "Entrar" : kind === "cadastro" ? "Criar conta" : kind === "recuperar" ? "Solicitar recuperação" : "Salvar nova senha")}</button>
        </form>
      </section>}
      {response && <p role="status" className={styles.response}>{t(response)}</p>}
      {confirmationRequired && <p className={styles.response}><Link className={styles.inlineLink} href={href(`/confirmar-email${returnQuery}`)}>{t("Reenviar confirmação")}</Link></p>}
      <nav className={styles.links} aria-label={t("Opções de acesso")}>
        {kind !== "login" && <Link href={href(`/login${returnQuery}`)}>{t("Já tenho uma conta")}</Link>}
        {kind !== "cadastro" && <Link href={href(`/cadastro${returnQuery}`)}>{t("Criar conta")}</Link>}
        {kind === "login" && <Link href={href(`/recuperar-senha${returnQuery}`)}>{t("Esqueci minha senha")}</Link>}
        <Link href={href(returnTo)}>{t(returnTo === "/checkout" || returnTo === "/carrinho" ? "Voltar à compra" : "Voltar")}</Link>
      </nav>
    </div>
  </PageShell>;
}
