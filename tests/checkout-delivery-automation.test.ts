import { describe, expect, it } from 'vitest';
import { emptyDelivery } from '../src/features/checkout/checkout-context';
import { mergePostalSuggestion, preserveShippingMethod } from '../src/features/checkout/delivery-automation';

describe('delivery suggestions preserve the visitor’s choices', () => {
  it('fills only blank address fields from a postal response', () => {
    const draft={ ...emptyDelivery(), postal:'01001-000', street:'Rua já editada', city:'Cidade já editada' };
    const next=mergePostalSuggestion(draft,'01001000',{logradouro:'Rua do resultado',bairro:'Sé',localidade:'São Paulo',uf:'SP'});
    expect(next).toMatchObject({street:'Rua já editada',district:'Sé',city:'Cidade já editada',province:'SP'});
    expect(draft.district).toBe('');
  });
  it('ignores old postal results after the postal code or country changes', () => {
    const current={ ...emptyDelivery(),postal:'02002000' };
    expect(mergePostalSuggestion(current,'01001000',{logradouro:'Resposta antiga'})).toBe(current);
    const international={...current,country:'US' as const};
    expect(mergePostalSuggestion(international,'02002000',{logradouro:'Resposta antiga'})).toBe(international);
  });
  it('keeps a field deliberately cleared during lookup but fills other empty fields',()=>{
    const current={...emptyDelivery(),postal:'01001-000',street:'',number:'123'};
    expect(mergePostalSuggestion(current,'01001000',{logradouro:'Rua sugerida',bairro:'Sé',localidade:'São Paulo',uf:'SP'},['street']))
      .toMatchObject({street:'',number:'123',district:'Sé',city:'São Paulo',province:'SP'});
  });
  it('refuses missing postal records and never copies arbitrary response values', () => {
    const current={...emptyDelivery(),postal:'01001000'};
    expect(()=>mergePostalSuggestion(current,'01001000',{erro:true})).toThrow();
    expect(mergePostalSuggestion(current,'01001000',{logradouro:{unexpected:true},bairro:'x'.repeat(300),session:'private'})).toMatchObject({street:'',district:'x'.repeat(160)});
    expect(mergePostalSuggestion(current,'01001000',{})).not.toHaveProperty('session');
  });
  it('retains a still-offered method but does not silently select a different one', () => {
    const options=[{method:'standard' as const,priceInCents:800,businessDays:{min:null,max:7}},{method:'express' as const,priceInCents:1400,businessDays:{min:2,max:3}}];
    expect(preserveShippingMethod('express',options)).toBe('express');
    expect(preserveShippingMethod('express',[options[0]])).toBe('');
    expect(preserveShippingMethod('',options)).toBe('');
  });
});
