import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct, products } from "@/domain/catalog";
import { ProductDetail } from "@/components/catalog/product-detail";
import { localizedMetadata } from "@/i18n/server";

type ProductPageProps = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return products.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  return product ? localizedMetadata(product.name, product.description) : localizedMetadata("Produto não encontrado");
}
export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  return <ProductDetail slug={product.slug} />;
}
