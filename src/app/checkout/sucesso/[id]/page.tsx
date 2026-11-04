import { localizedMetadata } from "@/i18n/server";
import { OrderDetailsScreen } from '@/features/account/account-screen';
export async function generateMetadata() { return localizedMetadata("Confirmação do pedido"); }
export default async function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <OrderDetailsScreen id={id} confirmation />; }
