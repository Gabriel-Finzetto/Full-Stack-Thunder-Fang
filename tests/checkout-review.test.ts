import { describe, expect, it } from 'vitest';
import type { CheckoutInput, CheckoutQuoteDto, OrderDto } from '../src/contracts/api';
import type { CartSnapshot } from '../src/domain/commerce';
import { consumeSnapshot } from '../src/domain/commerce';
import { checkoutInput, orderMatchesReview, orderResultUncertain, quoteMatchesInput, readCheckoutQuote, readShippingQuote, reviewStateKey, reviewUsable, snapshotMatchesItems } from '../src/features/checkout/purchase-review';
import { emptyDelivery } from '../src/features/checkout/checkout-context';

const input: CheckoutInput = {items:[{slug:'original',quantity:6}],delivery:{country:'BR',region:'SP-CAPITAL',street:'Rua fictícia',postal:'',number:'',noNumber:false,complement:'',district:'',city:'',province:'',reference:'',instructions:''},method:'standard'};
const quote: CheckoutQuoteDto = {items:[{slug:'original',name:'Original',quantity:6,unitPriceInCents:1279,lineTotalInCents:7674}],currency:'BRL',quantity:6,subtotalInCents:7674,discountInCents:767,productsTotalInCents:6907,shippingInCents:800,totalInCents:7707,delivery:{...input.delivery,regionName:'São Paulo capital',zone:'BR',resolvedAddress:'Rua fictícia',referenceApplied:false,method:'standard',priceInCents:800,businessDays:{min:null,max:7}},reviewToken:'signed-review',reviewExpiresAt:'2026-10-29T14:10:00Z'};
const snapshot: CartSnapshot = {generation:'cart',revision:1,batches:[{id:'first',slug:'original',quantity:3},{id:'second',slug:'original',quantity:3}]};
const owner='00000000-0000-4000-8000-000000000001';
const {reviewToken:_token,reviewExpiresAt:_expiry,...draft}=quote;
const order: OrderDto = {...draft,id:'00000000-0000-4000-8000-000000000002',number:'TF-TEST',ownerId:owner,status:'simulation_completed',createdAt:'2026-10-29T14:00:00Z',expiresAt:'2026-10-30T14:00:00Z'};

describe('revisão de checkout recebida do servidor',()=>{
  it('valida valores exatos e recusa totais ou desconto inconsistentes',()=>{
    expect(readCheckoutQuote(quote).totalInCents).toBe(7707);
    expect(()=>readCheckoutQuote({...quote,totalInCents:7708})).toThrow();
    expect(()=>readCheckoutQuote({...quote,discountInCents:768})).toThrow();
    expect(()=>readCheckoutQuote({...quote,items:[...quote.items,...quote.items]})).toThrow();
  });
  it('recusa frete sem as duas modalidades distintas ou fora do teto',()=>{
    const value={country:'BR',region:'SP-CAPITAL',zone:'BR',quantity:6,currency:'BRL',options:[{method:'standard',priceInCents:800,businessDays:{min:null,max:7}},{method:'express',priceInCents:1400,businessDays:{min:2,max:3}}]};
    expect(readShippingQuote(value).options).toHaveLength(2);
    expect(()=>readShippingQuote({...value,options:[value.options[0],value.options[0]]})).toThrow();
    expect(()=>readShippingQuote({...value,options:[value.options[0],{...value.options[1],priceInCents:3001}]})).toThrow();
  });
  it('normaliza os campos da mesma forma que a API sem enviar estado visual',()=>{
    expect(checkoutInput(input.items,{...emptyDelivery(),...input.delivery,street:'  Rua fictícia  ',method:'standard'})).toEqual(input);
    expect(checkoutInput(input.items,emptyDelivery())).toBeNull();
  });
  it('verifica que a resposta corresponde ao endereço e itens solicitados',()=>{
    expect(quoteMatchesInput(quote,input)).toBe(true);
    expect(quoteMatchesInput({...quote,delivery:{...quote.delivery,country:'US'}},input)).toBe(false);
    expect(quoteMatchesInput({...quote,items:[{...quote.items[0],quantity:7}]},input)).toBe(false);
  });
  it('invalida a revisão por mudança do carrinho, preço, destino, conta, sessão ou vencimento',()=>{
    const key=reviewStateKey('cart:1','prices:1',input);
    const accepted={key,ownerId:owner,identityVersion:1,quote};
    const state={key,ownerId:owner,identityVersion:1};const now=Date.parse('2026-10-29T14:00:00Z');
    expect(reviewUsable(accepted,state,now)).toBe(true);
    expect(reviewUsable(accepted,{...state,key:reviewStateKey('cart:2','prices:1',input)},now)).toBe(false);
    expect(reviewUsable(accepted,{...state,key:reviewStateKey('cart:1','prices:2',input)},now)).toBe(false);
    expect(reviewUsable(accepted,{...state,key:reviewStateKey('cart:1','prices:1',{...input,delivery:{...input.delivery,street:'Outra rua'}})},now)).toBe(false);
    expect(reviewUsable(accepted,{...state,ownerId:null},now)).toBe(false);
    expect(reviewUsable(accepted,{...state,identityVersion:2},now)).toBe(false);
    expect(reviewUsable(accepted,state,Date.parse(quote.reviewExpiresAt))).toBe(false);
  });
});

describe('confirmação e consumo seguro do carrinho',()=>{
  it('correlaciona a captura aceita por quantidades, sem confundir adições posteriores',()=>{
    expect(snapshotMatchesItems(snapshot,input.items)).toBe(true);
    expect(snapshotMatchesItems(snapshot,[{slug:'original',quantity:7}])).toBe(false);
    const current={...snapshot,version:1 as const,lastActivity:Date.now(),consumedOrders:[],batches:[...snapshot.batches,{id:'later',slug:'original' as const,quantity:2}]};
    const consumed=consumeSnapshot(current,snapshot,order.id);
    expect(consumed.batches).toEqual([{id:'later',slug:'original',quantity:2}]);
    expect(consumeSnapshot(consumed,snapshot,order.id)).toBe(consumed);
  });
  it('somente permite consumir captura de um pedido que corresponde à revisão e ao proprietário',()=>{
    expect(orderMatchesReview(order,quote,input,owner)).toBe(true);
    expect(orderMatchesReview({...order,ownerId:'another'},quote,input,owner)).toBe(false);
    expect(orderMatchesReview({...order,totalInCents:8000},quote,input,owner)).toBe(false);
    expect(orderMatchesReview({...order,delivery:{...order.delivery,businessDays:{min:null,max:9}}},quote,input,owner)).toBe(false);
  });
  it('considera rede, timeout, falha 5xx e resposta ilegível como resultado incerto, sem permitir reenvio automático',()=>{
    for(const error of [new TypeError('fetch failed'),{code:'ORDER_RESULT_UNKNOWN',status:201},{status:503},{status:502},null])expect(orderResultUncertain(error)).toBe(true);
    for(const error of [{code:'ORDER_LIMIT_REACHED',status:409},{code:'SESSION_CHANGED',status:409},{status:400},{status:401},{status:429}])expect(orderResultUncertain(error)).toBe(false);
  });
});
