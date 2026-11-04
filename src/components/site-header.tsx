"use client";

import Image from "next/image";
import { canArtwork } from "@/domain/product-artwork";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { stripLocale } from "@/i18n/config";
import { useCatalog } from '@/features/catalog/catalog-context';
import { useStore } from "@/features/store/store-context";
import { useAccount } from "@/features/account/account-context";
import { useLocale } from "@/i18n/locale-context";
import { FlagSelect } from "./flag-select";
import styles from "./site-header.module.css";

const languageOptions = [
  { value: "pt-BR", label: "PT-BR", flag: "BR" },
  { value: "en", label: "EN", flag: "US" },
  { value: "es", label: "ES", flag: "ES" },
  { value: "zh-Hans", label: "简体中文", flag: "CN" },
] as const;

export function SiteHeader() {
  const { t, href, locale, setLocale } = useLocale();
  const { products } = useCatalog();
  const { totals, openCart } = useStore();
  const { user, ready, signOut, signOutError } = useAccount();
  const router = useRouter();
  const pathname = stripLocale(usePathname() ?? "/");
  const [homeSection, setHomeSection] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const signOutPending = useRef(false);
  const activeOwner = useRef(user?.id ?? null);
  activeOwner.current = user?.id ?? null;
  const activeSection = pathname.startsWith("/produtos") ? "produtos" : pathname === "/" ? homeSection : pathname === "/redes-sociais" ? "redes-sociais" : "";
  const signedIn = ready && !!user;
  const accountLabel = user?.name.trim().split(/\s+/u)[0] || t("Conta");
  const header = useRef<HTMLElement>(null);
  const navigationBar = useRef<HTMLDivElement>(null);
  const productsMenu = useRef<HTMLDetailsElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const secondaryMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (pathname !== "/") { setHomeSection(""); return; }
    let frame = 0;
    const update = () => {
      frame = 0;
      if (window.scrollY < 32) { setHomeSection(""); return; }
      const threshold = (navigationBar.current?.getBoundingClientRect().height ?? 0) + 72;
      let current = "";
      const sections = [document.getElementById("produtos"), document.getElementById("conceito")];
      for (const section of sections) if (section && section.getBoundingClientRect().top <= threshold) current = section.id;
      setHomeSection(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("hashchange", schedule);
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule); observer.observe(document.body);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("hashchange", schedule); window.removeEventListener("resize", schedule); };
  }, [pathname]);
  useEffect(() => {
    const bar = navigationBar.current; if (!bar) return;
    const measure = () => document.documentElement.style.setProperty('--site-header-height', `${bar.getBoundingClientRect().height}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const observer = new ResizeObserver(measure); observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const menus = [productsMenu, accountMenu, secondaryMenu];
    const onPointer = (event: PointerEvent) => { menus.forEach((menu) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; }); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") menus.forEach((menu) => { if (menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }); };
    document.addEventListener("pointerdown", onPointer); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, []);
  useEffect(() => {
    for (const menu of [productsMenu, accountMenu, secondaryMenu]) if (menu.current) menu.current.open = false;
  }, [pathname, locale, user?.id]);
  const close = () => { for (const menu of [productsMenu, accountMenu, secondaryMenu]) if (menu.current) menu.current.open = false; };
  const closeOthers = (current: HTMLDetailsElement) => {
    if (!current.open) return;
    for (const menu of [productsMenu, accountMenu, secondaryMenu]) if (menu.current && menu.current !== current) menu.current.open = false;
  };
  const logout = async () => {
    if (signOutPending.current) return;
    signOutPending.current = true;
    setSigningOut(true);
    const owner = activeOwner.current;
    try {
      await signOut();
      if (activeOwner.current !== owner && activeOwner.current !== null) return;
      close();
      router.replace(href("/"));
    } catch {
      // AccountProvider keeps the feedback visible even when the menu is removed.
    } finally {
      signOutPending.current = false;
      setSigningOut(false);
    }
  };
  const secondaryLinks = <>
    <Link href={href("/#conceito")} aria-current={activeSection === "conceito" ? "location" : undefined} onClick={close}>{t("Conceito")}</Link>
    <Link href={href("/redes-sociais")} aria-current={activeSection === "redes-sociais" ? "page" : undefined} onClick={close}>{t("Redes sociais")}</Link>
  </>;
  return <div ref={navigationBar} className={styles.sticky}>
    <a className="skip-link" href="#conteudo" tabIndex={0}>{t("Ir para o conteúdo")}</a>
    <div className={styles.notice}>Portfolio demo <span aria-hidden="true">/</span> {t("Projeto demonstrativo. Sem cobrança ou envio de produtos.")}</div>
    <header ref={header} className={styles.header}>
      <Link href={href("/")} aria-label={t("Thunder Fang Energy — início")} className={styles.brand} onClick={close}><Image src="/images/brand/logo-horizontal.png" alt="Thunder Fang Energy" width={256} height={80} priority /></Link>
      <nav aria-label={t("Navegação principal")} className={styles.nav}>
        <details ref={productsMenu} className={styles.productsMenu} onToggle={event => closeOthers(event.currentTarget)}>
          <summary aria-controls="navbar-produtos" aria-current={activeSection === "produtos" ? "true" : undefined}>{t("Produtos")} <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></summary>
          <div id="navbar-produtos" className={styles.productPanel}>
            <div className={styles.panelHeading}><span>ENERGY DRINKS</span><Link href={href("/produtos")} onClick={close}>{t("Ver catálogo completo")} <span aria-hidden="true">→</span></Link></div>
            <ul>{products.map((product) => <li key={product.slug}><Link href={href(`/produtos/${product.slug}`)} onClick={close} aria-current={pathname === `/produtos/${product.slug}` ? "page" : undefined}><Image src={canArtwork(product.slug)} alt="" width={1024} height={1536} sizes="64px" /><span>{product.name}</span><small>{product.volumeMl} ml</small></Link></li>)}</ul>
            <Link className={styles.homeCatalog} href={href("/#produtos")} onClick={close}>{t("Ver sabores na home")} <span aria-hidden="true">↓</span></Link>
          </div>
        </details>
        <div className={styles.desktopLinks}>{secondaryLinks}</div>
        <details ref={secondaryMenu} className={styles.secondaryMenu} onToggle={event => closeOthers(event.currentTarget)}>
          <summary aria-controls="navbar-secondary" aria-label={`${t("Menu")}: ${t("Mais opções de navegação")}`}>
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            {t("Menu")}
          </summary>
          <div id="navbar-secondary" className={styles.secondaryPanel}>{secondaryLinks}</div>
        </details>
      </nav>
      <div className={styles.utilities}>
        <div className={styles.language}><FlagSelect label={t("Idioma")} value={locale} options={languageOptions} onChange={setLocale} compact /></div>
        {!ready ? <span className={styles.accountStatus} role="status">{t("Carregando…")}</span> : signedIn ? <details ref={accountMenu} className={`${styles.accountMenu} ${styles.accountSignedIn}`} onToggle={event => closeOthers(event.currentTarget)}>
          <summary aria-label={`${t("Conta")} — ${user!.name}`} aria-controls="navbar-account" title={user!.name}>
            <svg width="19" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" stroke="currentColor" strokeWidth="1.4" /></svg>
            <span className={styles.accountName}>{accountLabel}</span>
            <svg className={styles.accountChevron} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </summary>
          <div id="navbar-account" className={styles.accountPanel}>
            <Link href={href("/conta")} onClick={close}>{t("Minha conta")}</Link>
            <Link href={href("/conta#meus-pedidos")} onClick={close}>{t("Meus pedidos")}</Link>
            <button type="button" onClick={() => void logout()} disabled={signingOut} aria-busy={signingOut}>{t(signingOut ? "Saindo…" : "Sair")}</button>
          </div>
        </details> : <div className={styles.accountGuest}>
          <Link href={href("/login")} onClick={close}>{t("Entre")}</Link>
          <span aria-hidden="true">/</span>
          <Link href={href("/cadastro")} onClick={close}>{t("Cadastre-se")}</Link>
        </div>}
        <button type="button" className={styles.cartButton} onClick={() => { close(); openCart(); }} aria-label={`${t("Abrir carrinho")}: ${totals.quantity} ${t("latas")}`}><svg width="20" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 4h2l2.5 12h11l2-9H6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="9" cy="20" r="1.2" fill="currentColor" /><circle cx="18" cy="20" r="1.2" fill="currentColor" /></svg><span className={styles.cartCount}>{totals.quantity}</span></button>
      </div>
    </header>
    {signOutError && <p className={styles.notice} role="alert">{t(signOutError)}</p>}
  </div>;
}
