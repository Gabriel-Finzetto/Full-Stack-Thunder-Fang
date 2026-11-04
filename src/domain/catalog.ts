export type ProductSlug =
  | "original"
  | "citricos"
  | "tropicais"
  | "frutas-vermelhas";

export interface Product {
  slug: ProductSlug;
  name: string;
  flavorProfile: string;
  description: string;
  priceInCents: number;
  volumeMl: number;
  image: string;
  accent: string;
  background: string;
  ornament: string;
}

export const products: readonly Product[] = [
  {
    slug: "original",
    name: "Original",
    flavorProfile: "Doce, ácido e levemente herbal",
    description:
      "O clássico de presença marcante: doçura, acidez e um toque herbal para acompanhar seu próximo desafio.",
    priceInCents: 1279,
    volumeMl: 500,
    image: "/images/products/original.png",
    accent: "#00A7AB",
    background: "#004EAB",
    ornament: "#AB9100",
  },
  {
    slug: "citricos",
    name: "Cítricos",
    flavorProfile: "Limão, lima, laranja e grapefruit",
    description:
      "Acidez vibrante e frescor cítrico para quem gosta de seguir em frente com atitude.",
    priceInCents: 1279,
    volumeMl: 500,
    image: "/images/products/citricos.png",
    accent: "#ABA600",
    background: "#75AB00",
    ornament: "#2DAB00",
  },
  {
    slug: "tropicais",
    name: "Tropicais",
    flavorProfile: "Manga, maracujá, abacaxi e coco",
    description:
      "Uma combinação tropical intensa, com doçura e acidez na medida para dar personalidade à sua próxima conquista.",
    priceInCents: 1279,
    volumeMl: 500,
    image: "/images/products/tropicais.png",
    accent: "#AB7800",
    background: "#AB8C00",
    ornament: "#ABA100",
  },
  {
    slug: "frutas-vermelhas",
    name: "Frutas Vermelhas",
    flavorProfile: "Morango, framboesa, mirtilo e cranberry",
    description:
      "Frutas vermelhas, sabor envolvente e um toque ácido para acompanhar quem quer ir além.",
    priceInCents: 1279,
    volumeMl: 500,
    image: "/images/products/frutas-vermelhas.png",
    accent: "#A400AB",
    background: "#AB0052",
    ornament: "#AB0600",
  },
];

export function getProduct(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}

const priceFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatPrice(amountInCents: number): string {
  return priceFormatter.format(amountInCents / 100);
}
