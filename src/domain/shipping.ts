export type Country = 'BR' | 'US' | 'ES' | 'CN';
export type ShippingMethod = 'standard' | 'express';
export const countries = [{ code: 'BR', name: 'Brasil' }, { code: 'US', name: 'Estados Unidos' }, { code: 'ES', name: 'Espanha' }, { code: 'CN', name: 'China' }] as const;
export const brazilRegions = [
  { code: 'SP-CAPITAL', name: 'São Paulo capital', base: 800 }, { code: 'SP-OTHER', name: 'Demais municípios de SP', base: 1200 }, { code: 'SOUTH-SOUTHEAST', name: 'Demais estados do Sudeste e Sul', base: 1600 }, { code: 'CENTER-WEST', name: 'Centro-Oeste', base: 1800 }, { code: 'NORTHEAST', name: 'Nordeste', base: 2000 }, { code: 'NORTH', name: 'Norte', base: 2200 },
] as const;
export const countryShipping = {
  BR: { base: 0, zone: 'Brasil', standard: 'Até 7 dias úteis', express: '2 a 3 dias úteis', reference: 'Praça da Sé, Sé, São Paulo, SP, CEP 01001-000' },
  US: { base: 1800, zone: 'América do Norte', standard: '10 a 16 dias úteis', express: '5 a 8 dias úteis', reference: 'Casa Branca, 1600 Pennsylvania Avenue NW, Washington, DC 20500' },
  ES: { base: 2000, zone: 'Europa', standard: '10 a 18 dias úteis', express: '5 a 9 dias úteis', reference: 'Puerta del Sol, Plaza Puerta del Sol, 28013 Madrid' },
  CN: { base: 2200, zone: 'Ásia', standard: '12 a 25 dias úteis', express: '6 a 12 dias úteis', reference: 'Portão de Tiananmen, East Chang’an Avenue, Dongcheng, Pequim' },
} as const;
export function quoteShipping(country: Country, region: string, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !region) throw new Error('INVALID_SHIPPING');
  const settings = countryShipping[country];
  const base = country === 'BR' ? brazilRegions.find(item => item.code === region)?.base : settings.base;
  if (base === undefined) throw new Error('INVALID_REGION');
  const extra = quantity <= 6 ? 0 : quantity <= 12 ? 200 : quantity <= 24 ? 400 : 600;
  const standard = Math.min(2400, base + extra);
  return { standard, express: Math.min(3000, standard + 600), zone: settings.zone, standardDays: settings.standard, expressDays: settings.express };
}
