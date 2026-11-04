import { localizedMetadata } from "@/i18n/server";
import { Checkout } from '@/features/checkout/checkout';
export async function generateMetadata() { return localizedMetadata("Finalizar pedido"); }
export default Checkout;
