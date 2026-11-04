import { describe, expect, it } from 'vitest';
import { defaultDeliverySchema, profileUpdateSchema } from '../src/contracts/profile';
import { preferSavedDelivery } from '../src/features/checkout/saved-delivery';
import type { DeliveryDraft } from '../src/features/checkout/checkout-context';

const empty: DeliveryDraft = { country:'BR',region:'',postal:'',street:'',number:'',noNumber:false,complement:'',district:'',city:'',province:'',reference:'',instructions:'',method:'' };
const saved = { delivery:{...empty,region:'SP-CAPITAL',street:'Rua fictícia'}, method:'express' as const };
delete (saved.delivery as Partial<DeliveryDraft>).method;

describe('entrega padrão privada', () => {
  it('preenche uma compra nova sem copiar preço ou tokens de uma compra antiga', () => {
    const parsed = defaultDeliverySchema.parse(saved);
    expect(preferSavedDelivery(empty,parsed)).toEqual({...parsed.delivery,method:'express'});
    expect(defaultDeliverySchema.safeParse({...saved,priceInCents:1}).success).toBe(false);
  });
  it('preserva endereço e região editados antes do login', () => {
    for(const draft of [{...empty,country:'US' as const},{...empty,street:'Destino desta compra'},{...empty,region:'NORTH'},{...empty,noNumber:true}]) expect(preferSavedDelivery(draft,saved)).toBe(draft);
    expect(preferSavedDelivery(empty,null)).toBe(empty);
  });
  it('rejeita região estrangeira ao país, conflito de número e preferência vazia', () => {
    for(const delivery of [{...saved.delivery,region:'US-CA'},{...saved.delivery,number:'10',noNumber:true},{...empty,region:'SP-CAPITAL'}]) expect(defaultDeliverySchema.safeParse({delivery,method:'standard'}).success).toBe(false);
  });
  it('distingue preservar a preferência de removê-la explicitamente', () => {
    expect(profileUpdateSchema.parse({name:' Nome '})).toEqual({name:'Nome'});
    expect(profileUpdateSchema.parse({name:'Nome',defaultDelivery:null})).toEqual({name:'Nome',defaultDelivery:null});
    expect(profileUpdateSchema.safeParse({name:'Nome',email:'arbitrary@example.test'}).success).toBe(false);
  });
});
