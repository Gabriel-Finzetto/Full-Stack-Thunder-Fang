import { localizedMetadata } from "@/i18n/server";
import { CatalogPage } from "@/components/catalog/catalog-page";

export async function generateMetadata() { return localizedMetadata("Produtos", "Conheça os quatro sabores Thunder Fang Energy e monte sua combinação."); }

export default function ProductsPage() { return <CatalogPage />; }
