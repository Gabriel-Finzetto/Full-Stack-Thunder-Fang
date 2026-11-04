import { localizedMetadata } from "@/i18n/server";
import { CartPage } from '@/features/store/cart-ui';
export async function generateMetadata() { return localizedMetadata("Carrinho"); }
export default CartPage;
