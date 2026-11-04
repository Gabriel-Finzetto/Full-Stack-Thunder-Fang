import { describe, expect, it } from 'vitest';
import { estimateArrival } from '../src/domain/arrival-estimate';

describe('previsão demonstrativa em dias úteis', () => {
  it('conta a partir do dia seguinte e pula o fim de semana', () => {
    expect(estimateArrival('2026-11-06T18:00:00Z', { min: 2, max: 3 })).toEqual({ earliest: '2026-11-10', latest: '2026-11-11' });
  });
  it('usa a data da loja em São Paulo mesmo quando o UTC já virou o dia', () => {
    expect(estimateArrival('2026-11-07T01:00:00Z', { min: null, max: 1 })).toEqual({ earliest: null, latest: '2026-11-09' });
  });
  it('começa na segunda quando o pedido é feito no sábado ou domingo', () => {
    for (const created of ['2026-11-07T18:00:00Z', '2026-11-08T18:00:00Z']) {
      expect(estimateArrival(created, { min: 1, max: 5 })).toEqual({ earliest: '2026-11-09', latest: '2026-11-13' });
    }
  });
  it('avança semanas e a virada do ano sem considerar feriados', () => {
    expect(estimateArrival('2026-12-31T18:00:00Z', { min: 1, max: 6 })).toEqual({ earliest: '2027-01-01', latest: '2027-01-08' });
  });
  it('não calcula dados inválidos nem intervalos invertidos', () => {
    expect(estimateArrival('invalid', { min: 1, max: 2 })).toBeNull();
    expect(estimateArrival('2026-11-03T18:00:00Z', { min: 5, max: 2 })).toBeNull();
    expect(estimateArrival('2026-11-03T18:00:00Z', { min: null, max: Number.MAX_SAFE_INTEGER })).toBeNull();
  });
});
