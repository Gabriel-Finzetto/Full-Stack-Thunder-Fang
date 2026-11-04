'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Country, ShippingMethod } from '@/domain/shipping';
import { clearsCheckoutDraft, IDENTITY_CHANGE_EVENT } from '@/features/account/identity-transition';
import type { CheckoutInput, CheckoutQuoteDto, OrderDto } from '@/contracts/api';
import type { CartSnapshot } from '@/domain/commerce';
import { useStore } from '@/features/store/store-context';
import { useAccount } from '@/features/account/account-context';
import { CHECKOUT_DRAFT_KEY, restoreCheckoutDraft, serializeCheckoutDraft } from './draft-storage';
import { preferSavedDelivery } from './saved-delivery';

export type DeliveryDraft = { country: Country; region: string; postal: string; street: string; number: string; noNumber: boolean; complement: string; district: string; city: string; province: string; reference: string; instructions: string; method: ShippingMethod | ''; };
export const emptyDelivery = (): DeliveryDraft => ({ country: 'BR', region: '', postal: '', street: '', number: '', noNumber: false, complement: '', district: '', city: '', province: '', reference: '', instructions: '', method: '' });
export type PurchaseAttempt = { ownerId: string; identityVersion: number; input: CheckoutInput; quote: CheckoutQuoteDto; snapshot: CartSnapshot; startedAt: number; uncertain: boolean };
export type PurchaseReceipt = { identityVersion: number; order: OrderDto; snapshot: CartSnapshot; cartConsumed: boolean; cartPending: boolean };
type Value = { draft: DeliveryDraft; setDraft: React.Dispatch<React.SetStateAction<DeliveryDraft>>; step: number; setStep: React.Dispatch<React.SetStateAction<number>>; quoteRevision: string | null; setQuoteRevision: React.Dispatch<React.SetStateAction<string | null>>;
  draftReady: boolean;
  beginNewPurchase(): boolean;
  identityVersion: number; getIdentityVersion():number; attempt: PurchaseAttempt|null; setAttempt(value:PurchaseAttempt|null):void; receipt:PurchaseReceipt|null; setReceipt(value:PurchaseReceipt|null):void;
};
const Context = createContext<Value | null>(null);
export function CheckoutProvider({ children }: { children: ReactNode }) {
  const store=useStore(); const account=useAccount();
  const [draft, setDraft] = useState(emptyDelivery); const [step, setStep] = useState(0); const [quoteRevision, setQuoteRevision] = useState<string | null>(null);
  const [draftReady,setDraftReady]=useState(false); const hydrated=useRef(false); const cartGeneration=useRef(''); const draftExpiry=useRef<number|null>(null);
  const preferenceScope=useRef('');
  const epoch=useRef(0); const [identityVersion,setIdentityVersion]=useState(0);
  const [attempt,writeAttempt]=useState<PurchaseAttempt|null>(null); const [receipt,writeReceipt]=useState<PurchaseReceipt|null>(null);
  const receiptId=receipt?.order.id;
  useEffect(()=>{
    if(!receiptId)return;
    // A completed purchase must not revive its old address when the receipt expires.
    setDraft(emptyDelivery());setQuoteRevision(null);draftExpiry.current=null;preferenceScope.current='';
  },[receiptId]);
  useEffect(()=>{
    if(hydrated.current||store.loading||!account.ready||account.error&&!account.user||!store.cart.generation)return;
    hydrated.current=true;cartGeneration.current=store.cart.generation;
    try {
      const restored=restoreCheckoutDraft(sessionStorage.getItem(CHECKOUT_DRAFT_KEY),{ownerId:account.user?.id??null,cartGeneration:store.cart.generation});
      if(restored&&store.cart.items.length){setDraft(restored.draft);setStep(restored.step);draftExpiry.current=restored.expiresAt;}
      else sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
    } catch { /* Navigation in this tab still preserves the in-memory draft. */ }
    setDraftReady(true);
  },[store.loading,store.cart.generation,store.cart.items.length,account.ready,account.user?.id,account.error]);
  useEffect(()=>{
    if(!draftReady||store.loading||!account.ready||account.error&&!account.user)return;
    if(cartGeneration.current!==store.cart.generation){cartGeneration.current=store.cart.generation;setDraft(emptyDelivery());setStep(0);setQuoteRevision(null);draftExpiry.current=null;try{sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);}catch{}return;}
    try {
      const encoded=!receipt&&!attempt&&store.cart.items.length?serializeCheckoutDraft(draft,step,{ownerId:account.user?.id??null,cartGeneration:store.cart.generation}):null;
      if(encoded){sessionStorage.setItem(CHECKOUT_DRAFT_KEY,encoded);draftExpiry.current=JSON.parse(encoded).expiresAt;}
      else{sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);draftExpiry.current=null;}
    } catch { /* Restricted storage does not block checkout. */ }
  },[draft,step,draftReady,store.loading,store.cart.generation,store.cart.items.length,account.ready,account.user?.id,account.error,receipt,attempt]);
  useEffect(()=>{
    if(!draftReady||!account.ready||!account.user?.defaultDelivery||!store.cart.items.length||attempt||receipt)return;
    const scope=`${account.user.id}:${store.cart.generation}`;
    if(preferenceScope.current===scope)return;
    preferenceScope.current=scope;
    setDraft(current=>preferSavedDelivery(current,account.user?.defaultDelivery));
  },[draftReady,account.ready,account.user,store.cart.generation,store.cart.items.length,attempt,receipt]);
  useEffect(()=>{
    if(!draftReady)return;
    const expire=()=>{if(draftExpiry.current!==null&&draftExpiry.current<=Date.now()){draftExpiry.current=null;try{sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);}catch{}if(!attempt&&!receipt){setDraft(emptyDelivery());setStep(0);setQuoteRevision(null);}}};
    const timer=window.setInterval(expire,10000);window.addEventListener('focus',expire);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',expire);};
  },[draftReady,attempt,receipt]);
  useEffect(() => {
    const reset = (event: Event) => {
      if (!(event instanceof CustomEvent) || !clearsCheckoutDraft(event.detail)) return;
      epoch.current+=1;setIdentityVersion(epoch.current);writeAttempt(null);writeReceipt(null);
      preferenceScope.current='';
      setDraft(emptyDelivery()); setStep(0); setQuoteRevision(null);
      draftExpiry.current=null;try{sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);}catch{}
    };
    window.addEventListener(IDENTITY_CHANGE_EVENT, reset);
    return () => window.removeEventListener(IDENTITY_CHANGE_EVENT, reset);
  }, []);
  return <Context.Provider value={{ draft, setDraft, step, setStep, quoteRevision, setQuoteRevision, draftReady, identityVersion, getIdentityVersion:()=>epoch.current,
    beginNewPurchase:()=>{
      // A new combination cannot hide an unresolved order or cart-consumption result.
      if(attempt||receipt&&(!receipt.cartConsumed||receipt.cartPending))return false;
      if(receipt){writeReceipt(null);setDraft(emptyDelivery());setStep(0);setQuoteRevision(null);draftExpiry.current=null;preferenceScope.current='';}
      return true;
    },
    attempt,setAttempt:value=>{if(!value||value.identityVersion===epoch.current)writeAttempt(value);},
    receipt,setReceipt:value=>{if(!value||value.identityVersion===epoch.current)writeReceipt(value);},
  }}>{children}</Context.Provider>;
}
export function useCheckoutDraft() { const value = useContext(Context); if (!value) throw new Error('CheckoutProvider ausente'); return value; }
