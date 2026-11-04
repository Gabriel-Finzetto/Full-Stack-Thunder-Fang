export const locales = ['pt-BR', 'en', 'es', 'zh-Hans'] as const;
export type Locale = typeof locales[number];
export type Messages = Record<string, readonly [string, string, string]>;
export const isLocale = (value: string | undefined | null): value is Locale => locales.includes(value as Locale);
export function languageMatch(value: string) {
  if (/^pt(?:-|$)/i.test(value)) return 'pt-BR' as const;
  if (/^en(?:-|$)/i.test(value)) return 'en' as const;
  if (/^es(?:-|$)/i.test(value)) return 'es' as const;
  if (/^zh(?:-Hans(?:-.*)?|-CN|-SG)?$/i.test(value)) return 'zh-Hans' as const;
}
export function preferredLocale(header: string | null): Locale {
  if (!header?.trim()) return 'pt-BR';
  const languages = header.split(',').map((entry, index) => { const [tag, quality] = entry.trim().split(';'); return { tag, quality: quality ? Number(quality.replace('q=', '')) : 1, index }; }).filter(item => item.quality > 0).sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of languages) { const supported = languageMatch(tag); if (supported) return supported; }
  return 'en';
}
export function stripLocale(path: string) { return path.replace(/^\/(pt-BR|en|es|zh-Hans)(?=\/|\?|#|$)/, '') || '/'; }
