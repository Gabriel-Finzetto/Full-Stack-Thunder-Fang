import { localizedMetadata } from "@/i18n/server";
import { ProfessionalInfo } from "@/components/professional-info";
export async function generateMetadata() { return localizedMetadata("Redes sociais", "Conheça os perfis profissionais e o trabalho por trás da Thunder Fang Energy."); }
export default function SocialPage() { return <ProfessionalInfo kind="social" />; }
