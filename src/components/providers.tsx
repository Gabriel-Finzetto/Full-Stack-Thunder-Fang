'use client';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/config';
import { LocaleProvider } from '@/i18n/locale-context';
import { AccountProvider } from '@/features/account/account-context';
import { StoreProvider } from '@/features/store/store-context';
import { CheckoutProvider } from '@/features/checkout/checkout-context';
import { CartDrawer, StoreNotice } from '@/features/store/cart-ui';
import { DemoNotice } from './demo-notice';
import { CatalogProvider } from '@/features/catalog/catalog-context';
import { HelpCenter } from './help-center';
export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleProvider initialLocale={locale}><CatalogProvider><AccountProvider><StoreProvider><CheckoutProvider>{children}<CartDrawer /><StoreNotice /><DemoNotice /><HelpCenter /></CheckoutProvider></StoreProvider></AccountProvider></CatalogProvider></LocaleProvider>;
}
