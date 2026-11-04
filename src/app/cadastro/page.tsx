import { localizedMetadata } from "@/i18n/server";
import { AuthScreen } from "@/features/account/auth-screen";
export async function generateMetadata() { return localizedMetadata("Crie sua conta"); }
export default function Page() { return <AuthScreen kind="cadastro" />; }
