import { describe, expect, it, vi } from 'vitest';
import type { CreateOrderInput, OrderDto } from '../src/contracts/api';
import { AccountRequestError, businessDaysText, readOrder, readOrders, sendOrder } from '../src/features/account/order-data';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const at = new Date('2026-10-29T10:00:00Z');
function order(): OrderDto {
  return {
    id:'00000000-0000-4000-8000-000000000003',number:'TF-TEST',ownerId:owner,status:'simulation_completed',currency:'BRL',
    createdAt:at.toISOString(),expiresAt:new Date(at.getTime()+86400000).toISOString(),
    items:[{slug:'original',name:'Original',quantity:6,unitPriceInCents:1279,lineTotalInCents:7674}],
    quantity:6,subtotalInCents:7674,discountInCents:767,productsTotalInCents:6907,shippingInCents:800,totalInCents:7707,
    delivery:{country:'BR',region:'SP-CAPITAL',postal:'01001-000',street:'',number:'',noNumber:true,complement:'Complemento fictício',district:'Sé',city:'São Paulo',province:'SP',reference:'Referência fictícia',instructions:'Instrução fictícia',
      regionName:'São Paulo capital',zone:'BR',resolvedAddress:'Praça da Sé, Sé, São Paulo, SP, CEP 01001-000',referenceApplied:true,method:'standard',priceInCents:800,businessDays:{min:null,max:7}},
  };
}
const input: CreateOrderInput = { items:[{slug:'original',quantity:6}],delivery:order().delivery,method:'standard',reviewToken:'accepted-quote' };

describe('dados privados de pedidos no cliente', () => {
  it('preserva a entrega completa e os valores históricos recebidos do servidor', () => {
    const result=readOrder(order(),owner,at.getTime());
    expect(result?.delivery).toEqual(order().delivery);
    expect(result?.items[0].unitPriceInCents).toBe(1279);
  });
  it('não aceita dados de outro proprietário, mesmo com totais válidos', () => {
    expect(()=>readOrder(order(),other,at.getTime())).toThrowError(AccountRequestError);
  });
  it('oculta vencidos e rejeita prazo adulterado ou valores inconsistentes', () => {
    expect(readOrder(order(),owner,at.getTime()+86400000)).toBeNull();
    expect(()=>readOrder({...order(),totalInCents:1},owner,at.getTime())).toThrow();
    expect(()=>readOrder({...order(),expiresAt:new Date(at.getTime()+3600000).toISOString()},owner,at.getTime())).toThrow();
    expect(()=>readOrder({...order(),items:[...order().items,...order().items]},owner,at.getTime())).toThrow();
  });
  it('recusa uma lista parcialmente vazada ou repetida em vez de apresentar os registros', () => {
    expect(()=>readOrders({orders:[order(),{...order(),ownerId:other}],nextCursor:null},owner,at.getTime())).toThrow();
    expect(()=>readOrders({orders:[order(),order()],nextCursor:null},owner,at.getTime())).toThrow();
    expect(readOrders({orders:[order()],nextCursor:null},owner,at.getTime()+86400000).orders).toEqual([]);
  });
  it('formata os dois tipos de prazo usando textos traduzíveis', () => {
    const translate=(text:string)=>({'Até {max} dias úteis':'Up to {max} business days','{min} a {max} dias úteis':'{min} to {max} business days'}[text]??text);
    expect(businessDaysText({min:null,max:7},translate)).toBe('Up to 7 business days');
    expect(businessDaysText({min:2,max:3},translate)).toBe('2 to 3 business days');
  });
});

describe('envio único e resultado incerto de uma compra', () => {
  it('envia a revisão uma vez com contexto da conta, sem inventar campos financeiros', async () => {
    const fresh={...order(),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};
    fresh.expiresAt=new Date(Date.parse(fresh.createdAt)+86400000).toISOString();
    const fetcher=vi.fn().mockResolvedValue(Response.json({order:fresh},{status:201}));
    await expect(sendOrder(input,'es',owner,fetcher)).resolves.toEqual(fresh);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/orders?locale=es');
    const options=fetcher.mock.calls[0][1];
    expect(options.headers['X-TF-Account']).toBe(owner);
    expect(options.credentials).toBe('same-origin');
    expect(JSON.parse(options.body)).toEqual(input);
  });
  it('preserva o código de recusa definitiva do limite sem repetir a compra', async () => {
    const fetcher=vi.fn().mockResolvedValue(Response.json({code:'ORDER_LIMIT_REACHED'},{status:409}));
    await expect(sendOrder(input,'pt-BR',owner,fetcher)).rejects.toMatchObject({code:'ORDER_LIMIT_REACHED',status:409});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('classifica rede, erro após possível gravação e sucesso inválido como resultado incerto', async () => {
    const attempts=[
      vi.fn().mockRejectedValue(new TypeError('Offline')),
      vi.fn().mockResolvedValue(Response.json({code:'SERVICE_UNAVAILABLE'},{status:503})),
      vi.fn().mockResolvedValue(Response.json({order:{}},{status:201})),
      vi.fn().mockResolvedValue(Response.json({order:{...order(),ownerId:other}},{status:201})),
    ];
    for(const fetcher of attempts) {
      await expect(sendOrder(input,'pt-BR',owner,fetcher)).rejects.toMatchObject({code:'ORDER_RESULT_UNKNOWN'});
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
