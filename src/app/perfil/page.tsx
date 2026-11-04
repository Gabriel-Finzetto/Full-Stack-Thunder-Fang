import { redirect } from "next/navigation";
import { getServerTranslator } from "@/i18n/server";
export default async function Page() { const { locale } = await getServerTranslator(); redirect(`/${locale}/conta#meu-perfil`); }
