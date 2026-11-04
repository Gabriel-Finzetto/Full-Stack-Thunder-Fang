import { localizedMetadata } from "@/i18n/server";
import { AccountScreen } from "@/features/account/account-screen";
export async function generateMetadata() { return localizedMetadata("Minha conta"); }
export default function Page() { return <AccountScreen />; }
