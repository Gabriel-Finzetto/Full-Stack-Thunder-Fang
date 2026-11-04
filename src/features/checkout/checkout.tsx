'use client';
import Image from 'next/image';
import { canArtwork } from '@/domain/product-artwork';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatPrice, getProduct } from '@/domain/catalog';
import { countries, brazilRegions, type Country } from '@/domain/shipping';
import { internationalRegions } from '@/domain/regions';
import type { BusinessDays, CheckoutInput, CheckoutQuoteDto, ShippingQuoteDto } from '@/contracts/api';
import type { CartSnapshot } from '@/domain/commerce';
import { useStore } from '@/features/store/store-context';
import { CartSummary } from '@/features/store/cart-ui';
import { useCatalog } from '@/features/catalog/catalog-context';
import { useAccount } from '@/features/account/account-context';
import { useLocale } from '@/i18n/locale-context';
import { PageShell } from '@/components/ui';
import { FlagSelect } from '@/components/flag-select';
import { useCheckoutDraft, type DeliveryDraft, type PurchaseAttempt } from './checkout-context';
import { checkoutInput, CheckoutRequestError, orderMatchesReview, orderResultUncertain, postQuote, quoteMatchesInput, readCheckoutQuote, readShippingQuote, reviewStateKey, reviewUsable, snapshotMatchesItems } from './purchase-review';
import { mergePostalSuggestion, preserveShippingMethod, type PostalAddressField } from './delivery-automation';
import styles from './checkout-ux.module.css';

type Review = { quote: CheckoutQuoteDto; input: CheckoutInput; snapshot: CartSnapshot; key: string; ownerId: string|null; identityVersion: number };
const failureMessage = (error: unknown) => {
  const code=error&&typeof error==='object'&&'code'in error?error.code:'';
  if(code==='RATE_LIMITED')return 'Muitas solicitações. Aguarde antes de tentar novamente.';
  if(code==='ORDER_LIMIT_REACHED')return 'Você atingiu o limite de cinco pedidos. Exclua um pedido existente para liberar uma vaga.';
  if(code==='PRODUCT_UNAVAILABLE')return 'Um produto não está disponível. Confira seu carrinho antes de continuar.';
  if(code==='QUOTE_CHANGED'||code==='REVIEW_EXPIRED'||code==='INVALID_REVIEW')return 'A revisão mudou ou expirou. Confira os valores atualizados antes de confirmar.';
  if(code==='SESSION_CHANGED'||code==='AUTH_REQUIRED'||code==='SESSION_EXPIRED')return 'Sua sessão mudou. Entre novamente para continuar.';
  return 'Não foi possível concluir a solicitação. Tente novamente.';
};
export function Checkout() {
  const {locale,t,href}=useLocale(); const store=useStore(); const account=useAccount(); const catalog=useCatalog();
  const context=useCheckoutDraft();
  const {draft,setDraft,step,setStep,setQuoteRevision,identityVersion,attempt,setAttempt,receipt,setReceipt}=context;
  const draftRef=useRef(draft);draftRef.current=draft;
  const postalDigits=draft.postal.replace(/\D/g,'');
  const [errors,setErrors]=useState<Record<string,string>>({});const [feedback,setFeedback]=useState('');const [cepBusy,setCepBusy]=useState(false);
  const [shippingState,setShippingState]=useState<{key:string;quote:ShippingQuoteDto}|null>(null);const [review,setReview]=useState<Review|null>(null);
  const [quoteBusy,setQuoteBusy]=useState(false);const [accepted,setAccepted]=useState(false);const [resendAccepted,setResendAccepted]=useState(false);const [cartBusy,setCartBusy]=useState(false);
  const [clock,setClock]=useState(0);
  const [shippingFailure,setShippingFailure]=useState(false);const [shippingRetry,setShippingRetry]=useState(0);const [postalRetry,setPostalRetry]=useState(0);
  const postalAttempt=useRef('');const shippingAttempt=useRef('');const lastShippingFailure=useRef(0);
  const shippingAutoRetries=useRef(0);const shippingFailureCode=useRef('');
  const postalRequest=useRef<AbortController|null>(null);const quoteRequest=useRef<AbortController|null>(null);const quoteVersion=useRef(0);
  const quoteKind=useRef<'shipping'|'review'|null>(null);
  const countryVersion=useRef(0);const postalVersion=useRef(0);const postalFieldEdits=useRef({street:0,district:0,city:0,province:0});const formRef=useRef<HTMLFormElement>(null);const mounted=useRef(false);const purchasing=useRef(false);
  const previousStep=useRef(step);
  const cartToken=`${store.cart.generation}:${store.cart.revision}`;
  const input=checkoutInput(store.cart.items,draft);
  const reviewKey=input?reviewStateKey(cartToken,catalog.revision,input):'';
  const shippingKey=JSON.stringify([cartToken,catalog.revision,draft.country,draft.region]);
  const previousShippingKey=useRef(shippingKey);
  const current=useRef({reviewKey,shippingKey,ownerId:account.user?.id??null,identityVersion});
  current.current={reviewKey,shippingKey,ownerId:account.user?.id??null,identityVersion};
  const shippingQuote=shippingState?.key===shippingKey?shippingState.quote:null;
  const selectedShipping=shippingQuote?.options.find(option=>option.method===draft.method);
  const reviewValid=!!review&&account.ready&&reviewUsable(review,{key:reviewKey,ownerId:account.user?.id??null,identityVersion},Math.max(clock,Date.now()));
  const catalogueAvailable=store.catalogReady&&!store.catalogError&&!store.unavailableSlugs.length;
  const checkoutAvailable=catalogueAvailable&&!store.loading&&!store.error;
  const regions=draft.country==='BR'?brazilRegions:internationalRegions[draft.country];
  const deliveryReady=regions.some(region=>region.code===draft.region)&&(['postal','street','number','complement','district','city','province','reference','instructions']as const).some(key=>/\S/u.test(draft[key]));
  const dayText=(days:BusinessDays)=>days.min===null?`${t('Até')} ${days.max} ${t('dias úteis')}`:`${days.min} ${t('a')} ${days.max} ${t('dias úteis')}`;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;postalRequest.current?.abort();quoteRequest.current?.abort();};},[]);
  useEffect(()=>{if(previousStep.current===step)return;previousStep.current=step;if(quoteKind.current==='review'){quoteVersion.current++;quoteRequest.current?.abort();quoteKind.current=null;setQuoteBusy(false);}const frame=requestAnimationFrame(()=>{const heading=formRef.current?.querySelector<HTMLElement>('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'nearest'});}});return()=>cancelAnimationFrame(frame);},[step]);
  useEffect(()=>{if(!review&&!receipt)return;const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer);},[review,receipt]);
  useEffect(()=>{if(attempt?.uncertain&&attempt.ownerId===account.user?.id)void account.refreshOrders().catch(()=>{});},[attempt?.uncertain,attempt?.startedAt,account.user?.id,account.refreshOrders]);
  useEffect(()=>{
    if(!receipt)return;
    const expired=Date.parse(receipt.order.expiresAt)<=Date.now();
    const removed=account.ready&&account.user?.id===receipt.order.ownerId&&account.ordersReady&&!account.ordersError&&!account.orders.some(order=>order.id===receipt.order.id);
    if(expired||removed){setReceipt(null);setStep(0);setFeedback('O pedido foi removido ou expirou. Consulte os pedidos existentes da sua conta.');}
  },[receipt,clock,account.ready,account.user?.id,account.ordersReady,account.ordersError,account.orders,setReceipt,setStep]);
  useEffect(()=>{
    if(previousShippingKey.current!==shippingKey){previousShippingKey.current=shippingKey;quoteVersion.current++;quoteRequest.current?.abort();quoteKind.current=null;setQuoteBusy(false);setShippingState(null);setQuoteRevision(null);setShippingFailure(false);shippingAttempt.current='';shippingAutoRetries.current=0;if(step>=2&&!attempt&&!receipt){setStep(2);setFeedback('O carrinho ou os preços mudaram. Atualizando o frete para você conferir novamente.');}}
    if(review&&!reviewUsable(review,{key:reviewKey,ownerId:account.ready?account.user?.id??null:review.ownerId,identityVersion},Date.now())){
      setReview(null);setAccepted(false);if(step===3&&!attempt&&!receipt&&review.identityVersion===identityVersion){setStep(2);setFeedback('A revisão mudou ou expirou. Confira os valores atualizados antes de confirmar.');}
    }
    if(step===3&&!review&&!attempt&&!receipt){setStep(2);}
  },[shippingKey,reviewKey,identityVersion,account.ready,account.user?.id,clock,shippingState,review,step,attempt,receipt,setDraft,setStep,setQuoteRevision]);
  useEffect(()=>{
    const postal=postalDigits;
    const key=`${draft.country}:${postal}:${postalRetry}`;
    if(!context.draftReady||draft.country!=='BR'||postal.length!==8){postalRequest.current?.abort();setCepBusy(false);postalAttempt.current='';return;}
    if(postalAttempt.current===key)return;
    const timer=window.setTimeout(()=>{postalAttempt.current=key;void lookupPostal();},450);
    return()=>{window.clearTimeout(timer);postalRequest.current?.abort();};
  },[context.draftReady,draft.country,postalDigits,postalRetry]);
  useEffect(()=>{
    if(!context.draftReady||step!==2||attempt||receipt||quoteBusy||!checkoutAvailable||!deliveryReady||shippingQuote)return;
    const key=`${shippingKey}:${identityVersion}:${shippingRetry}`;
    if(shippingAttempt.current===key)return;
    const timer=window.setTimeout(()=>{shippingAttempt.current=key;void calculateShipping();},300);
    return()=>window.clearTimeout(timer);
  },[context.draftReady,step,attempt,receipt,quoteBusy,checkoutAvailable,deliveryReady,shippingKey,identityVersion,shippingRetry,shippingQuote]);
  useEffect(()=>{
    const retry=()=>{if(shippingFailure&&document.visibilityState==='visible'&&Date.now()-lastShippingFailure.current>5000)setShippingRetry(value=>value+1);};
    window.addEventListener('online',retry);window.addEventListener('focus',retry);
    return()=>{window.removeEventListener('online',retry);window.removeEventListener('focus',retry);};
  },[shippingFailure]);
  useEffect(()=>{
    if(!shippingFailure||step!==2||shippingAutoRetries.current>=2||shippingFailureCode.current==='RATE_LIMITED'||!navigator.onLine||document.visibilityState!=='visible')return;
    const timer=window.setTimeout(()=>{shippingAutoRetries.current++;setShippingRetry(value=>value+1);},shippingAutoRetries.current===0?1500:5000);
    return()=>window.clearTimeout(timer);
  },[shippingFailure,step,shippingRetry]);
  function invalidateReview(){if(quoteKind.current!=='shipping'){quoteVersion.current++;quoteRequest.current?.abort();quoteKind.current=null;setQuoteBusy(false);}setReview(null);setAccepted(false);}
  function editStep(target:number){
    if(target<0||target>=step||attempt||receipt)return;
    invalidateReview();setErrors({});setFeedback('');setStep(target);
  }
  function update<K extends keyof DeliveryDraft>(key:K,value:DeliveryDraft[K]){
    invalidateReview();if(key==='postal'&&String(value).replace(/\D/g,'')!==postalDigits)postalVersion.current++;
    if(key in postalFieldEdits.current)postalFieldEdits.current[key as PostalAddressField]++;
    setDraft(current=>({...current,[key]:value}));
    const addressEntered=['postal','street','number','complement','district','city','province','reference','instructions'].includes(key)&&typeof value==='string'&&/\S/u.test(value);
    setErrors(current=>({...current,[key]:'',...(addressEntered?{address:''}:{})}));
    if(key==='region'){setShippingState(null);setQuoteRevision(null);setShippingFailure(false);}
  }
  function changeCountry(value:Country){
    invalidateReview();countryVersion.current++;postalRequest.current?.abort();setCepBusy(false);setShippingState(null);setQuoteRevision(null);setShippingFailure(false);setErrors({});
    setDraft(current=>({...current,country:value,region:'',postal:'',district:'',province:'',method:''}));
    setFeedback('País alterado. Confira a região e preencha novamente código postal, bairro e estado/província quando necessário. O frete anterior foi descartado.');
  }
  function validateDelivery(){
    const next:Record<string,string>={};
    if(!regions.some(region=>region.code===draft.region))next.region='Escolha a região de entrega.';
    const fields=['postal','street','number','complement','district','city','province','reference','instructions']as const;
    if(!fields.some(key=>/\S/u.test(draft[key])))next.address='Preencha pelo menos um campo livre de entrega com um caractere significativo. Dados fictícios são permitidos.';
    setErrors(next);if(Object.keys(next).length){requestAnimationFrame(()=>formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());return false;}return true;
  }
  async function lookupPostal(){
    const postal=draft.postal.replace(/\D/g,'');if(postal.length!==8){setFeedback('Informe oito dígitos para consultar o CEP ou preencha o endereço manualmente.');return;}
    postalRequest.current?.abort();const controller=new AbortController();postalRequest.current=controller;
    let timedOut=false;const timeout=window.setTimeout(()=>{timedOut=true;controller.abort();},8000);
    const version=countryVersion.current,edits={...postalFieldEdits.current},code=postalVersion.current;setCepBusy(true);setFeedback('Consultando CEP…');
    try{const response=await fetch(`https://viacep.com.br/ws/${postal}/json/`,{signal:controller.signal});if(!response.ok)throw new Error('CEP_LOOKUP_FAILED');
      const data:unknown=await response.json();
      if(version!==countryVersion.current||code!==postalVersion.current)return;
      const protectedFields=(Object.keys(edits)as PostalAddressField[]).filter(key=>edits[key]!==postalFieldEdits.current[key]);
      const currentDraft=draftRef.current,suggestion=mergePostalSuggestion(currentDraft,postal,data,protectedFields);
      if((['street','district','city','province']as const).some(key=>suggestion[key]!==currentDraft[key])){invalidateReview();setDraft(current=>mergePostalSuggestion(current,postal,data,protectedFields));}
      setFeedback('CEP consultado. Confira os campos e selecione a faixa de entrega. Você pode editar tudo manualmente.');
    }catch{if(!controller.signal.aborted||timedOut)setFeedback('Não foi possível consultar esse CEP. O preenchimento manual continua disponível.');}
    finally{window.clearTimeout(timeout);if(postalRequest.current===controller)setCepBusy(false);}
  }
  async function calculateShipping(){
    if(quoteBusy||!validateDelivery()||!checkoutAvailable)return;
    invalidateReview();const version=++quoteVersion.current;const key=shippingKey;const epoch=identityVersion;
    setQuoteRevision(null);setShippingFailure(false);
    const controller=new AbortController();quoteRequest.current=controller;quoteKind.current='shipping';setQuoteBusy(true);setFeedback('');
    try{const quote=await postQuote(`/api/shipping/quote?locale=${locale}`,{items:store.cart.items,country:draft.country,region:draft.region},readShippingQuote,AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]));
      if(!mounted.current||version!==quoteVersion.current||current.current.shippingKey!==key||context.getIdentityVersion()!==epoch)return;
      if(quote.country!==draft.country||quote.region!==draft.region||quote.quantity!==store.totals.quantity)throw new Error('INVALID_QUOTE');
      setShippingState({key,quote});setQuoteRevision(cartToken);shippingAutoRetries.current=0;setDraft(value=>({...value,method:preserveShippingMethod(value.method,quote.options)}));setErrors({});
    }catch(error){if(mounted.current&&!controller.signal.aborted&&version===quoteVersion.current){lastShippingFailure.current=Date.now();shippingFailureCode.current=error&&typeof error==='object'&&'code'in error?String(error.code):'';setShippingFailure(true);setFeedback(failureMessage(error));}}
    finally{if(mounted.current&&version===quoteVersion.current){quoteKind.current=null;setQuoteBusy(false);}}
  }
  async function prepareReview(){
    if(quoteBusy||!checkoutAvailable||!input||!shippingQuote||!selectedShipping){setErrors({method:'Selecione uma modalidade de envio para continuar.'});return;}
    const snapshot=store.capture();
    if(`${snapshot.generation}:${snapshot.revision}`!==cartToken||!snapshotMatchesItems(snapshot,input.items)){setFeedback('O carrinho mudou. Atualizando os valores para você conferir novamente.');void store.refresh();return;}
    const captured={key:reviewKey,ownerId:account.user?.id??null,identityVersion,input,snapshot};
    const version=++quoteVersion.current;quoteRequest.current?.abort();const controller=new AbortController();quoteRequest.current=controller;quoteKind.current='review';setQuoteBusy(true);setFeedback('');
    try{const quote=await postQuote(`/api/checkout/quote?locale=${locale}`,input,readCheckoutQuote,AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]));
      if(!mounted.current||version!==quoteVersion.current||current.current.reviewKey!==captured.key||current.current.ownerId!==captured.ownerId||context.getIdentityVersion()!==captured.identityVersion)return;
      if(!quoteMatchesInput(quote,input)||Date.parse(quote.reviewExpiresAt)<=Date.now())throw new Error('INVALID_QUOTE');
      setReview({...captured,quote});setClock(Date.now());setAccepted(false);setErrors({});setStep(3);
    }catch(error){if(mounted.current&&!controller.signal.aborted&&version===quoteVersion.current)setFeedback(failureMessage(error));}
    finally{if(mounted.current&&version===quoteVersion.current){quoteKind.current=null;setQuoteBusy(false);}}
  }
  async function consumeConfirmed(value:NonNullable<typeof receipt>){
    setCartBusy(true);setReceipt({...value,cartPending:true});
    try{await store.consume(value.snapshot,value.order.id);setReceipt({...value,cartConsumed:true,cartPending:false});}
    catch{setReceipt({...value,cartPending:false});if(mounted.current)setFeedback('O pedido foi confirmado, mas o carrinho não pôde ser atualizado. Tente atualizar somente o carrinho.');}
    finally{if(mounted.current)setCartBusy(false);}
  }
  async function purchase(){
    if(purchasing.current||attempt||!accepted||!review||!reviewValid||!account.user||!checkoutAvailable)return;
    if(account.orders.length>=5){setFeedback('Você atingiu o limite de cinco pedidos. Exclua um pedido existente para liberar uma vaga.');return;}
    const snapshotNow=store.capture();
    if(`${snapshotNow.generation}:${snapshotNow.revision}`!==cartToken||!snapshotMatchesItems(review.snapshot,review.input.items)){invalidateReview();setStep(2);setFeedback('O carrinho mudou. Atualizando os valores para você conferir novamente.');return;}
    const record:PurchaseAttempt={ownerId:account.user.id,identityVersion,input:review.input,quote:review.quote,snapshot:review.snapshot,startedAt:Date.now(),uncertain:false};
    purchasing.current=true;setAttempt(record);setFeedback('');
    try{
      const order=await account.createOrder({...record.input,reviewToken:record.quote.reviewToken},locale,record.ownerId);
      if(context.getIdentityVersion()!==record.identityVersion)return;
      if(!orderMatchesReview(order,record.quote,record.input,record.ownerId))throw new CheckoutRequestError('ORDER_RESULT_UNKNOWN');
      const confirmed={identityVersion:record.identityVersion,order,snapshot:record.snapshot,cartConsumed:false,cartPending:true};
      setReceipt(confirmed);setAttempt(null);setReview(null);setAccepted(false);
      await consumeConfirmed(confirmed);
    }catch(error){
      if(context.getIdentityVersion()!==record.identityVersion)return;
      const code=error&&typeof error==='object'&&'code'in error?error.code:'';
      const uncertain=orderResultUncertain(error);
      if(uncertain){setAttempt({...record,uncertain:true});if(mounted.current)setFeedback('Não foi possível confirmar o resultado. O pedido pode ter sido criado. Consulte seus pedidos antes de iniciar outra compra.');}
      else{setAttempt(null);if(mounted.current)setFeedback(failureMessage(error));if(['QUOTE_CHANGED','REVIEW_EXPIRED','INVALID_REVIEW','PRODUCT_UNAVAILABLE','SESSION_CHANGED','AUTH_REQUIRED','SESSION_EXPIRED'].includes(String(code))){setReview(null);setAccepted(false);setShippingState(null);setQuoteRevision(null);shippingAttempt.current='';shippingAutoRetries.current=0;setShippingFailure(false);setDraft(value=>({...value,method:''}));if(mounted.current)setStep(2);void catalog.refresh().catch(()=>{});void account.refreshProfile().catch(()=>{});}}
    }finally{purchasing.current=false;}
  }
  function next(event:FormEvent){event.preventDefault();if(!checkoutAvailable)return;setFeedback('');if(step===0)setStep(1);else if(step===1&&validateDelivery())setStep(2);else if(step===2)void prepareReview();}
  const field=(key:'postal'|'street'|'number'|'complement'|'district'|'city'|'province'|'reference'|'instructions',label:string,wide=false,limit=160)=><label className={`field ${wide?'wide':''}`} key={key}>
    <span className={styles.fieldLabel}>{t(label)}<small className={styles.optional}>{t('Opcional')}</small></span>
    <input id={`delivery-${key}`} name={key} maxLength={limit} value={draft[key]} disabled={key==='number'&&draft.noNumber} inputMode={key==='postal'&&draft.country==='BR'?'numeric':undefined} aria-invalid={Boolean(errors[key]||key==='street'&&errors.address)} aria-describedby={['delivery-requirements',key==='street'&&errors.address?'delivery-error':'',errors[key]?`delivery-${key}-error`:''].filter(Boolean).join(' ')} onChange={event=>update(key,event.target.value)} autoComplete={key==='postal'?'shipping postal-code':key==='street'?'shipping address-line1':key==='complement'?'shipping address-line2':key==='city'?'shipping address-level2':key==='province'?'shipping address-level1':'off'}/>
    {errors[key]&&<span id={`delivery-${key}-error`} className="field-error">{t(errors[key])}</span>}
  </label>;
  const serverQuote=reviewValid?review?.quote:undefined;
  const shipping=serverQuote?.shippingInCents??selectedShipping?.priceInCents;
  if(receipt&&receipt.identityVersion===identityVersion){
    if(!account.ready)return <PageShell title={t('Confirmação do pedido')}><p role="status">{t('Verificando sua sessão…')}</p></PageShell>;
    if(receipt.order.ownerId===account.user?.id)return <PageShell title={t('Pedido confirmado')} description={t('Sua simulação foi concluída. Nenhuma cobrança ou entrega física será realizada.')}>
      <section className="panel"><h2>{receipt.order.number}</h2><p role="status">{t('O servidor confirmou a criação do seu pedido.')}</p><ul>{receipt.order.items.map(item=><li key={item.slug}>{item.quantity}× {item.name} · {formatPrice(item.lineTotalInCents)}</li>)}</ul><p><strong>{t('Total')}: {formatPrice(receipt.order.totalInCents)}</strong></p>
      {receipt.cartPending?<p role="status">{t('Atualizando carrinho…')}</p>:receipt.cartConsumed?<p>{t(store.cart.items.length?'Os itens confirmados foram removidos. Os itens acrescentados depois continuam no carrinho.':'Os itens confirmados foram removidos do carrinho.')}</p>:<div className="alert"><p>{t('O pedido foi confirmado, mas o carrinho não pôde ser atualizado. Tente atualizar somente o carrinho.')}</p><button type="button" className="btn btn-secondary" disabled={cartBusy} onClick={()=>void consumeConfirmed(receipt)}>{t(cartBusy?'Atualizando carrinho…':'Atualizar carrinho')}</button></div>}
      <div className="stack-actions"><Link className="btn" href={href('/conta#meus-pedidos')}>{t('Meus pedidos')}</Link><Link className="btn btn-secondary" href={href(`/pedidos/${receipt.order.id}`)}>{t('Ver detalhes do pedido')}</Link><Link className="btn btn-secondary" href={href('/conta')}>{t('Minha conta')}</Link><Link className="btn btn-secondary" href={href('/produtos')}>{t('Continuar explorando')}</Link>{store.cart.items.length>0&&receipt.cartConsumed&&<button type="button" className="btn btn-secondary" onClick={()=>{setReceipt(null);setStep(0);setShippingState(null);setReview(null);setFeedback('');}}>{t('Revisar os itens restantes')}</button>}</div></section></PageShell>;
  }
  if(attempt&&attempt.identityVersion===identityVersion)return <PageShell title={t(attempt.uncertain?'Resultado ainda não confirmado':'Confirmando seu pedido…')}><section className="panel" aria-busy={!attempt.uncertain}>
    <p role="status">{t(attempt.uncertain?'Não foi possível confirmar o resultado. O pedido pode ter sido criado. Consulte seus pedidos antes de iniciar outra compra.':'Aguarde a resposta do servidor. Não envie outra confirmação.')}</p>
    {attempt.uncertain&&<><p>{t('O carrinho foi preservado. Uma nova confirmação pode criar outro pedido igual.')}</p><div className="stack-actions"><Link className="btn" href={href('/pedidos')}>{t('Consultar meus pedidos')}</Link>{account.ordersError&&<button type="button" className="btn btn-secondary" onClick={()=>void account.refreshOrders().catch(()=>{})}>{t('Tentar novamente')}</button>}</div>{account.ordersError&&<p role="alert">{t(account.ordersError)}</p>}{account.ordersReady&&account.user?.id===attempt.ownerId&&<ul>{account.orders.map(order=><li key={order.id}><Link href={href(`/pedidos/${order.id}`)}>{order.number}</Link></li>)}</ul>}<label className="check-label"><input type="checkbox" checked={resendAccepted} onChange={event=>setResendAccepted(event.target.checked)}/>{t('Já conferi meus pedidos e entendo que outra confirmação pode criar um novo pedido.')}</label><button type="button" className="btn btn-secondary" disabled={!resendAccepted||!account.ready||account.user?.id!==attempt.ownerId} onClick={()=>{setAttempt(null);setReview(null);setAccepted(false);setResendAccepted(false);setStep(2);setFeedback('Confira uma nova revisão antes de confirmar outra compra.');}}>{t('Iniciar uma nova revisão')}</button></>}
  </section></PageShell>;
  if(!context.draftReady&&(store.error||account.error))return <PageShell title={t('Finalizar pedido')}><div className="alert" role="alert"><p>{t(store.error||account.error!)}</p><button className="btn btn-secondary" type="button" onClick={()=>{void store.refresh().catch(()=>{});void account.refreshProfile().catch(()=>{});}}>{t('Tentar novamente')}</button></div></PageShell>;
  if(store.loading||!context.draftReady)return <PageShell title={t('Finalizar pedido')}><p role="status">{t('Carregando…')}</p></PageShell>;
  if(!store.cart.items.length)return <PageShell title={t('Finalizar pedido')}>{feedback&&<p className="alert" role="status">{t(feedback)}</p>}<div className="empty-state"><h2>{t('Seu carrinho está vazio')}</h2><p>{t('Sua próxima combinação começa aqui. Escolha seus sabores.')}</p><Link href={href('/produtos')} className="btn">{t('Escolher sabores')}</Link></div></PageShell>;
  return <PageShell title={t('Tudo pronto para concluir?')} description={t('Envio demonstrativo nacional e internacional. Valores em reais, limitados a R$ 30,00. Prazos e fretes são fictícios; não haverá envio nem cobrança de tributos.')}>
    {store.error&&<div className="alert" role="alert"><p>{t(store.error)}</p><button type="button" className="btn btn-secondary" onClick={()=>void store.refresh().catch(()=>{})}>{t('Tentar novamente')}</button></div>}
    {!catalogueAvailable&&<div className="alert" role="alert"><p>{t(store.unavailableSlugs.length?'Um produto não está disponível. Confira seu carrinho antes de continuar.':store.catalogError||'Carregando preços e disponibilidade…')}</p><button type="button" className="btn btn-secondary" onClick={()=>void catalog.refresh().catch(()=>{})}>{t('Tentar novamente')}</button><Link href={href('/carrinho')}>{t('Carrinho')}</Link></div>}
    <ol className={`step-list ${styles.steps}`}>
      {['Identificação','Entrega','Frete','Revisão'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined}>
        {index<step?<button type="button" aria-label={`${t('Editar etapa')}: ${t(label)}`} onClick={()=>editStep(index)}><span aria-hidden="true">{index+1}</span>{t(label)}</button>:<><span aria-hidden="true">{index+1}</span>{t(label)}</>}
      </li>)}
    </ol>
    <div className="checkout-grid">
      <form ref={formRef} onSubmit={next} className="checkout-main" noValidate>
        <section className="panel">
          {step===0&&<>
            <h2>{t('Identificação')}</h2>
            {!account.ready?<p role="status">{t('Verificando sua sessão…')}</p>:account.user?<p>{account.user.name} · {account.user.email}</p>:<>
              <p>{t('Entre na sua conta para salvar o pedido e consultar seus dados com privacidade.')}</p>
              <p className="alert">{t('Você pode preencher a entrega agora. Entre na sua conta antes de confirmar o pedido.')}</p>
              <div className="stack-actions"><Link href={href('/login?retorno=/checkout')} className="btn btn-secondary">{t('Entrar')}</Link><Link href={href('/cadastro?retorno=/checkout')} className="btn">{t('Criar conta')}</Link></div>
            </>}
          </>}
          {step===1&&<>
            <h2>{t('Endereço de entrega')}</h2>
            {account.user?.defaultDelivery&&<div className="alert"><p>{t('Sua entrega padrão está disponível. Você pode usá-la ou preencher outro destino para este pedido.')}</p><button className="btn btn-secondary" type="button" onClick={()=>{const saved=account.user?.defaultDelivery;if(saved){postalRequest.current?.abort();countryVersion.current++;postalVersion.current++;setDraft({...saved.delivery,method:saved.method});setErrors({});setFeedback('Entrega padrão aplicada. Confira o destino antes de continuar.');}}}>{t('Usar entrega padrão')}</button><Link href={href('/conta#entrega-padrao')}>{t('Atualizar entrega padrão')}</Link></div>}
            <p className="muted fine-print">{t('Use dados fictícios. Seu preenchimento fica salvo temporariamente nesta guia por até 30 minutos. Nenhum dado de pagamento é solicitado.')}</p>
            <p id="delivery-requirements" className={styles.requirements}>{t('Escolha país e região e preencha pelo menos um campo de endereço, como rua ou CEP. Os demais campos podem ficar vazios.')}</p>
            <div className={`form-grid ${styles.deliveryGrid}`}>
              <div className="field">
                <label htmlFor="delivery-country" className={styles.fieldLabel}>{t('País de destino')}<small className={styles.optional}>{t('Obrigatório')}</small></label>
                <FlagSelect id="delivery-country" label={t('País de destino')} value={draft.country} options={countries.map(country=>({value:country.code,label:t(country.name),flag:country.code}))} onChange={value=>changeCountry(value as Country)}/>
              </div>
              <label className="field">
                <span className={styles.fieldLabel}>{t('Região de entrega')}<small className={styles.optional}>{t('Obrigatório')}</small></span>
                <select value={draft.region} aria-invalid={!!errors.region} aria-describedby={errors.region?'region-error':undefined} onChange={event=>update('region',event.target.value)}><option value="">{t('Selecione uma região')}</option>{regions.map(region=><option key={region.code} value={region.code}>{t(region.name)}</option>)}</select>
                {errors.region&&<span id="region-error" className="field-error">{t(errors.region)}</span>}
              </label>
              {field('postal',draft.country==='BR'?'CEP':'Código postal',true)}
              {draft.country==='BR'&&<p className={styles.postalHelp} role="status">{t(cepBusy?'Consultando CEP…':'Ao completar oito dígitos, o CEP é consultado automaticamente. Você pode preencher o endereço manualmente.')}</p>}
              {field('street','Rua ou linha principal do endereço',true,300)}
            </div>
            {errors.address&&<p id="delivery-error" className="field-error" role="alert">{t(errors.address)}</p>}
            <details className={styles.optionalDetails}>
              <summary>{t('Adicionar detalhes opcionais')}</summary>
              <div className="form-grid">
                {field('number','Número')}
                <label className={`check-label ${styles.noNumber}`}><input type="checkbox" checked={draft.noNumber} onChange={event=>{update('noNumber',event.target.checked);if(event.target.checked)update('number','');}}/>{t('Sem número')}</label>
                {field('complement','Complemento',true)}
                {draft.country==='BR'&&field('district','Bairro')}
                {field('city','Cidade')}
                {draft.country==='BR'&&field('province','Estado / província')}
                {field('reference','Ponto de referência',true,300)}
                {field('instructions','Instruções de entrega',true,500)}
              </div>
            </details>
            <p className="fine-print muted">{t('Se a linha principal ficar vazia, a referência demonstrativa do país será confirmada na revisão.')}</p>
          </>}
          {step===2&&<>
            <h2>{t('Escolha o frete')}</h2><p className="muted">{t('O frete acompanha automaticamente os sabores, a quantidade e o destino escolhidos.')}</p>
            {quoteBusy&&<p role="status">{t('Atualizando opções de entrega…')}</p>}
            {shippingFailure&&<div className="alert" role="alert"><p>{t('Não foi possível atualizar o frete. Seu preenchimento foi preservado.')}</p><button className="btn btn-secondary" type="button" disabled={quoteBusy||!checkoutAvailable} onClick={()=>setShippingRetry(value=>value+1)}>{t('Tentar novamente')}</button></div>}
            {shippingQuote&&<div className="shipping-options">{shippingQuote.options.map(option=><label className="shipping-option" key={option.method}><input type="radio" name="shipping-method" checked={draft.method===option.method} onChange={()=>{update('method',option.method);setErrors({});}}/><span>{t(option.method==='standard'?'Convencional':'Expresso')}<strong>{formatPrice(option.priceInCents)}</strong><small>{dayText(option.businessDays)}</small></span></label>)}</div>}
            {errors.method&&<p className="field-error" role="alert">{t(errors.method)}</p>}
            <p className="fine-print muted">{t('Idioma e país de entrega são independentes. A moeda continua BRL. Não há cobrança de tributos ou importação.')}</p>
          </>}
          {step===3&&!serverQuote&&<p role="status">{t('Verificando sua sessão…')}</p>}
          {step===3&&serverQuote&&<>
            <h2>{t('Confira sua escolha')}</h2>
            <div className={styles.reviewActions}>
              <button type="button" onClick={()=>editStep(1)}>{t('Editar entrega')}</button>
              <button type="button" onClick={()=>editStep(2)}>{t('Alterar frete')}</button>
              <Link href={href('/carrinho')} onClick={()=>editStep(2)}>{t('Editar itens no carrinho')}</Link>
            </div>
            <dl className="review-list">
              <dt>{t('Conta')}</dt><dd>{account.ready?account.user?`${account.user.name} · ${account.user.email}`:t('Entre na sua conta para confirmar.'):t('Verificando sua sessão…')}</dd>
              <dt>{t('País de destino')}</dt><dd>{t(countries.find(country=>country.code===serverQuote.delivery.country)!.name)}</dd>
              <dt>{t('Região de entrega')}</dt><dd>{t(regions.find(region=>region.code===serverQuote.delivery.region)?.name??serverQuote.delivery.regionName)}</dd>
              <dt>{t('Endereço informado ou referência')}</dt><dd>{[serverQuote.delivery.resolvedAddress,serverQuote.delivery.noNumber?t('Sem número'):serverQuote.delivery.number,serverQuote.delivery.complement,serverQuote.delivery.district,serverQuote.delivery.city,serverQuote.delivery.province,serverQuote.delivery.postal].filter(Boolean).join(', ')}</dd>
              {serverQuote.delivery.reference&&<><dt>{t('Ponto de referência')}</dt><dd>{serverQuote.delivery.reference}</dd></>}
              {serverQuote.delivery.instructions&&<><dt>{t('Instruções de entrega')}</dt><dd>{serverQuote.delivery.instructions}</dd></>}
              <dt>{t('Modalidade')}</dt><dd>{t(serverQuote.delivery.method==='express'?'Expresso':'Convencional')} · {dayText(serverQuote.delivery.businessDays)}</dd>
            </dl>
            <ul className="checkout-items">{serverQuote.items.map(item=><li key={item.slug}><span>{item.quantity}× {catalog.findProduct(item.slug)?.name??item.name}</span><strong>{formatPrice(item.lineTotalInCents)}</strong></li>)}</ul>
            <details className={styles.mobileSummary}>
              <summary><span>{t('Total do pedido')}</span><strong>{formatPrice(serverQuote.totalInCents)}</strong><small>{t('Ver resumo de valores')}</small></summary>
              <CartSummary shipping={shipping} quote={serverQuote}/>
            </details>
            <p className="fine-print muted">{t('Esta revisão tem validade limitada. Se algo mudar, confira novamente antes de confirmar.')}</p>
            <label className="check-label"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>{t('Entendo que esta compra é uma simulação, sem cobrança ou entrega física.')}</label>
            {!account.user&&<div className="stack-actions"><Link className="btn btn-secondary" href={href('/login?retorno=/checkout')}>{t('Entrar')}</Link><Link className="btn" href={href('/cadastro?retorno=/checkout')}>{t('Criar conta')}</Link></div>}
            {account.orders.length>=5&&<p className="alert" role="status">{t('Você atingiu o limite de cinco pedidos. Exclua um pedido existente para liberar uma vaga.')} <Link href={href('/pedidos')}>{t('Seus pedidos')}</Link></p>}
            <button className="btn" type="button" disabled={!accepted||!reviewValid||!account.user||account.orders.length>=5||!checkoutAvailable} onClick={()=>void purchase()}>{t('Confirmar simulação')}</button>
          </>}
          <div className="checkout-actions">
            {step>0?<button type="button" className="btn btn-secondary" onClick={()=>editStep(step-1)}>{t('Voltar')}</button>:<Link className="btn btn-secondary" href={href('/carrinho')}>{t('Carrinho')}</Link>}
            {step<3&&<button className="btn" type="submit" disabled={quoteBusy||!checkoutAvailable||(step===2&&(!shippingQuote||!selectedShipping))}>{t(quoteBusy?'Consultando…':step===0?'Conferir entrega':step===2?'Revisar pedido':'Continuar')} →</button>}
          </div>
        </section>
        {feedback&&<p className="alert" role="status">{t(feedback)}</p>}
      </form>
      <aside className={`checkout-aside panel ${step===3?styles.reviewAside:''}`}>
        <h2>{t('Sua combinação')}</h2>
        <ul className="checkout-items">{store.cart.items.map(item=>{const product=catalog.findProduct(item.slug)??getProduct(item.slug);return <li key={item.slug}><Image src={canArtwork(item.slug)} alt={t(product?.name??item.slug)} width={32} height={76}/><span>{item.quantity}× {t(product?.name??item.slug)}<small>{product?.volumeMl??500} ml</small></span></li>;})}</ul>
        <CartSummary shipping={shipping} quote={serverQuote}/><p className="fine-print muted">{t('Nenhum dado de pagamento é solicitado.')}</p>
      </aside>
    </div>
  </PageShell>;
}
