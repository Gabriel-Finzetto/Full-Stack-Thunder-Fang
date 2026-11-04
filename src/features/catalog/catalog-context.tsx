'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ProductDto } from '@/contracts/api';
import { useLocale } from '@/i18n/locale-context';
import { catalogRevision, catalogUnavailable, fetchCatalog } from './catalog-model';
import { createReadRefresh, visibleAndOnline } from '@/features/read-refresh';

type CatalogValue = {
  products: ProductDto[]; loading: boolean; refreshing: boolean; error: string; refreshError: string; revision: string;
  refresh(): Promise<void>; findProduct(slug: string): ProductDto | undefined;
};
const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [products,setProducts] = useState<ProductDto[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [refreshError,setRefreshError] = useState('');
  const [refreshing,setRefreshing] = useState(false);
  const loaded = useRef(false);
  const coordinator = useRef<ReturnType<typeof createReadRefresh> | null>(null);
  const version = useRef(0);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const read = useCallback(async () => {
    if (!mounted.current) return true;
    const current = ++version.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setLoading(!loaded.current);
    setRefreshing(loaded.current);
    try {
      const next = await fetchCatalog(locale, controller.signal);
      if (mounted.current && current === version.current) { loaded.current = true; setProducts(next); setError(''); setRefreshError(''); }
      return true;
    } catch {
      if (mounted.current && current === version.current) {
        if (loaded.current) setRefreshError(catalogUnavailable); else setError(catalogUnavailable);
      }
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (mounted.current && current === version.current) { setLoading(false); setRefreshing(false); request.current = null; }
    }
  },[locale]);
  const refresh = useCallback(async () => { await coordinator.current?.request(true); }, []);
  useEffect(() => {
    mounted.current = true;
    const automatic = createReadRefresh(read, { active:visibleAndOnline });
    coordinator.current = automatic;
    const focus = () => {
      if (navigator.onLine === false) {
        if (loaded.current) setRefreshError(catalogUnavailable); else { setError(catalogUnavailable); setLoading(false); }
      }
      void automatic.request();
    };
    const online = () => { void automatic.request(true); };
    focus();
    window.addEventListener('focus',focus);
    window.addEventListener('online',online);
    window.addEventListener('offline',focus);
    document.addEventListener('visibilitychange',focus);
    return () => { automatic.stop(); coordinator.current = null; mounted.current = false; version.current += 1; request.current?.abort(); window.removeEventListener('focus',focus); window.removeEventListener('online',online); window.removeEventListener('offline',focus); document.removeEventListener('visibilitychange',focus); };
  },[read]);
  const value = useMemo<CatalogValue>(() => ({ products, loading, refreshing, error, refreshError, refresh, revision: catalogRevision(products), findProduct: slug => products.find(product => product.slug === slug) }),[products,loading,refreshing,error,refreshError,refresh]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
export function useCatalog(): CatalogValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('CatalogProvider ausente');
  return value;
}
