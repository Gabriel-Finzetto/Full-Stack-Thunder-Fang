import type { Metadata } from "next";
import { headers } from "next/headers";
import { isLocale, type Messages } from "./config";
import { messages as interfaceMessages } from './messages';

export const siteDescription = "Conheça Thunder Fang Energy: quatro sabores, uma identidade marcante e uma experiência demonstrativa de e-commerce.";
export const slogan = "Entre quem você é e quem pode ser, existe uma escolha.";
export const sharingImage = { url: "/images/brand/compartilhamento.png", width: 1200, height: 630, alt: "Thunder Fang Energy — Portfolio Demo" };

const metadataMessages: Messages = {
  [siteDescription]: ["Discover Thunder Fang Energy: four flavors, a bold identity and a demonstration e-commerce experience.", "Conoce Thunder Fang Energy: cuatro sabores, una identidad con carácter y una experiencia demostrativa de comercio electrónico.", "探索Thunder Fang Energy：四种口味、鲜明品牌形象与电子商务演示体验。"],
  [slogan]: ["Between who you are and who you can become, there is a choice.", "Entre quien eres y quien puedes llegar a ser, hay una elección.", "在现在的你与未来的你之间，存在一个选择。"],
  "Conheça os quatro sabores Thunder Fang Energy e monte sua combinação.": ["Discover the four Thunder Fang Energy flavors and build your combination.", "Conoce los cuatro sabores de Thunder Fang Energy y crea tu combinación.", "了解Thunder Fang Energy的四种口味，搭配你的组合。"],
  "Conheça os perfis profissionais e o trabalho por trás da Thunder Fang Energy.": ["Discover the professional profiles and work behind Thunder Fang Energy.", "Conoce los perfiles profesionales y el trabajo detrás de Thunder Fang Energy.", "了解Thunder Fang Energy背后的职业资料与创作。"],
  "Entre em contato pelos perfis profissionais do portfólio Thunder Fang Energy.": ["Get in touch through the professional profiles of the Thunder Fang Energy portfolio.", "Contacta a través de los perfiles profesionales del portafolio Thunder Fang Energy.", "通过Thunder Fang Energy作品集中的职业资料联系我。"],
  "Produto não encontrado": ["Product not found", "Producto no encontrado", "未找到产品"],
};

const messages: Messages = { ...interfaceMessages, ...metadataMessages };
const graphLocales = { "pt-BR": "pt_BR", en: "en_US", es: "es_ES", "zh-Hans": "zh_CN" } as const;

export async function getServerTranslator() {
  const selected = (await headers()).get("x-tf-locale");
  const locale = isLocale(selected) ? selected : "pt-BR";
  const index = locale === "en" ? 0 : locale === "es" ? 1 : 2;
  return { locale, openGraphLocale: graphLocales[locale], t: (text: string) => locale === "pt-BR" ? text : messages[text]?.[index] ?? text };
}

export async function localizedMetadata(title: string, description = siteDescription): Promise<Metadata> {
  const { t, openGraphLocale } = await getServerTranslator();
  return {
    title: t(title), description: t(description),
    openGraph: { title: `${t(title)} | Thunder Fang`, description: t(description), type: "website", locale: openGraphLocale, images: [sharingImage] },
  };
}
