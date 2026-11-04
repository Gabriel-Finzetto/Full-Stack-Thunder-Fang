import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource/archivo-black/400.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/700.css";
import "./globals.css";
import "../styles/commerce.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { headers } from 'next/headers';
import { Providers } from '@/components/providers';
import { isLocale } from '@/i18n/config';
import { getServerTranslator, siteDescription, slogan, sharingImage } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t, openGraphLocale } = await getServerTranslator();
  return {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000"),
  title: { default: "Thunder Fang | E-commerce Portfolio", template: "%s | Thunder Fang" },
  description: t(siteDescription),
  applicationName: "Thunder Fang Energy",
  icons: { icon: [{ url: "/favicon.png", type: "image/png", sizes: "48x48" }], apple: "/apple-touch-icon.png" },
  openGraph: {
    title: "Thunder Fang | E-commerce Portfolio",
    description: t(slogan),
    type: "website",
    locale: openGraphLocale,
    images: [sharingImage],
  },
  robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const language = (await headers()).get('x-tf-locale');
  const locale = isLocale(language) ? language : 'pt-BR';
  return (
    <html lang={locale}>
      <body>
        <Providers locale={locale}>
        <SiteHeader />
        {children}
        <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
