'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { isLocale, stripLocale, type Locale, type Messages } from './config';
import { messages } from './messages';

const dictionary: Messages = messages;
type Value = { locale: Locale; t(text: string): string; href(path: string): string; setLocale(value: string): void };
const Context = createContext<Value | null>(null);
export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, changeLocale] = useState(initialLocale); const router = useRouter();
  useEffect(() => { changeLocale(initialLocale); }, [initialLocale]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const href = useCallback((path: string) => { if (/^(https?:|mailto:|tel:)/.test(path)) return path; const clean = stripLocale(path); return `/${locale}${clean === '/' ? '' : clean.startsWith('/') ? clean : `/${clean}`}`; }, [locale]);
  const t = useCallback((text: string) => locale === 'pt-BR' ? text : dictionary[text]?.[locale === 'en' ? 0 : locale === 'es' ? 1 : 2] ?? text, [locale]);
  const setLocale = (value: string) => {
    if (!isLocale(value)) return;
    changeLocale(value); document.cookie = `tf-locale=${value};path=/;max-age=31536000;SameSite=Lax`;
    const url = new URL(window.location.href); const clean = stripLocale(url.pathname); url.pathname = `/${value}${clean === '/' ? '' : clean}`; router.push(url.pathname + url.search + url.hash, { scroll: false });
  };
  const context = useMemo(() => ({ locale, t, href, setLocale }), [locale, t, href]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}
export function useLocale() { const value = useContext(Context); if (!value) throw new Error('LocaleProvider ausente'); return value; }
