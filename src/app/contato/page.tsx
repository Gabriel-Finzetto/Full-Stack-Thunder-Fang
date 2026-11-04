import { redirect } from 'next/navigation';
import { getServerTranslator } from '@/i18n/server';
export default async function ContactPage() {
  const { locale } = await getServerTranslator();
  redirect(`/${locale}?ajuda=mensagens`);
}
