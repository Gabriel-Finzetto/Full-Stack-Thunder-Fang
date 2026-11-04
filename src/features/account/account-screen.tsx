"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { canArtwork } from "@/domain/product-artwork";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatPrice, type ProductSlug } from "@/domain/catalog";
import { countries, brazilRegions, type Country, type ShippingMethod } from "@/domain/shipping";
import { internationalRegions } from "@/domain/regions";
import { estimateArrival } from "@/domain/arrival-estimate";
import { useCatalog } from "@/features/catalog/catalog-context";
import { useStore } from "@/features/store/store-context";
import { useCheckoutDraft } from "@/features/checkout/checkout-context";
import type { DeliveryInput, OrderDto } from "@/contracts/api";
import { PageShell, Modal } from "@/components/ui";
import { useLocale } from "@/i18n/locale-context";
import { useAccount } from "./account-context";
import { businessDaysText } from "./order-data";
import styles from "./account.module.css";

const accessNotice = "Entre na sua conta para consultar seus dados com privacidade.";

function AccessNotice({ destination = "/conta" }: { destination?: string }) {
  const { t, href } = useLocale();
  const { ready, error, refreshProfile } = useAccount();
  if (!ready) return <div className={styles.notice} role="status">{t("Verificando sua sessão…")}</div>;
  if (error) return <div className={styles.notice} role="alert"><p>{t(error)}</p><button className="btn btn-secondary" type="button" onClick={() => void refreshProfile()}>{t("Tentar novamente")}</button></div>;
  return <div className={styles.notice}><p>{t(accessNotice)}</p><Link className={styles.inlineLink} href={href(`/login?retorno=${encodeURIComponent(destination)}`)}>{t("Ir para a tela de acesso")} <span aria-hidden="true">→</span></Link></div>;
}

export function AccountScreen() {
  const { user } = useAccount();
  // Reset private editor state during the identity render, before another owner can see it.
  return <AccountEditor key={user?.id ?? "anonymous"} />;
}

function AccountEditor() {
  const { t, href } = useLocale();
  const { user, ready, error, refreshProfile, updateProfile, signOut } = useAccount();
  const [name, setName] = useState(user?.name ?? "");
  const [editing, setEditing] = useState(false);
  const [saveDelivery, setSaveDelivery] = useState(Boolean(user?.defaultDelivery));
  const [delivery, setDelivery] = useState<DeliveryInput>(() => user?.defaultDelivery?.delivery ?? blankDelivery());
  const [method, setMethod] = useState<ShippingMethod>(user?.defaultDelivery?.method ?? "standard");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState<"save" | "logout" | null>(null);
  const mutationLocked = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const regions = delivery.country === "BR" ? brazilRegions : internationalRegions[delivery.country];
  const openEditor = () => {
    setName(user?.name ?? ""); setSaveDelivery(Boolean(user?.defaultDelivery));
    setDelivery(user?.defaultDelivery?.delivery ?? blankDelivery());
    setMethod(user?.defaultDelivery?.method ?? "standard"); setResponse(""); setEditing(true);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !ready || mutationLocked.current) return;
    if (!name.trim()) { setResponse("Informe seu nome completo."); return; }
    if (saveDelivery && (!regions.some(region => region.code === delivery.region)
      || ![delivery.postal, delivery.street, delivery.number, delivery.complement, delivery.district, delivery.city, delivery.province, delivery.reference, delivery.instructions].some(value => value.trim()))) {
      setResponse("Escolha a região e preencha ao menos um campo do endereço de entrega."); return;
    }
    mutationLocked.current = true; setBusy("save");
    setResponse("");
    try {
      await updateProfile({ name: name.trim(), defaultDelivery: saveDelivery ? { delivery, method } : null });
      if (active.current) { setEditing(false); setResponse("Dados do perfil atualizados."); }
    }
    catch (failure) { if (active.current) setResponse(failure instanceof Error ? failure.message : "Não foi possível atualizar seu perfil. Tente novamente."); }
    finally { mutationLocked.current = false; if (active.current) setBusy(null); }
  };
  const logout = async () => {
    if (mutationLocked.current) return;
    mutationLocked.current = true;
    setBusy("logout");
    setResponse("");
    try { await signOut(); }
    catch (failure) { if (active.current) setResponse(failure instanceof Error ? failure.message : "Não foi possível sair da conta. Tente novamente."); }
    finally { mutationLocked.current = false; if (active.current) setBusy(null); }
  };

  return <PageShell eyebrow={t("SUA CONTA")} title={t("Minha conta")} description={t("Seu perfil, sua entrega e seus pedidos em um só lugar.")}>
    {!user && <AccessNotice />}
    {user && error && <div className={styles.notice} role="status"><p>{t("Não foi possível atualizar sua conta agora. Seus dados continuam disponíveis; vamos tentar novamente.")}</p><button className="btn btn-secondary" type="button" onClick={() => void refreshProfile()}>{t("Tentar novamente")}</button></div>}
    {user && <>
    <nav className={styles.accountNav} aria-label={t("Navegação da conta")}><a href="#meu-perfil">{t("Meu perfil")}</a><a href="#compra-rapida">{t("Compra rápida")}</a><a href="#meus-pedidos">{t("Meus pedidos")}</a></nav>
    <div className={styles.accountGrid}>
      <section id="meu-perfil" className={styles.block}>
        <div className={styles.sectionTop}><h2>{t("Informações pessoais")}</h2>{!editing && <button type="button" className="btn btn-secondary" disabled={!ready || Boolean(busy)} onClick={openEditor}>{t("Atualizar dados do perfil")}</button>}</div>
        {!editing ? <>
          <dl className={styles.profileDetails}><div><dt>{t("Nome completo")}</dt><dd>{user.name}</dd></div><div><dt>{t("E-mail da conta")}</dt><dd>{user.email}</dd></div></dl>
          <div id="entrega-padrao" className={styles.deliverySummary}><h3>{t("Entrega padrão")}</h3>{user.defaultDelivery ? <SavedDelivery delivery={user.defaultDelivery.delivery} method={user.defaultDelivery.method} /> : <p className={styles.muted}>{t("Salve um destino e uma modalidade para agilizar seus próximos pedidos.")}</p>}</div>
        </> : <form className={styles.form} onSubmit={saveProfile}>
          <fieldset className={styles.editorFields} disabled={!ready || Boolean(busy)}>
          <div className={styles.field}><label htmlFor="profile-name">{t("Nome completo")}</label><input id="profile-name" name="name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={120} required autoFocus /></div>
          <div className={styles.field}><label htmlFor="profile-email">{t("E-mail da conta")}</label><input id="profile-email" value={user.email} type="email" readOnly autoComplete="email" /><span className={styles.helper}>{t("Use este e-mail para entrar e recuperar sua conta.")}</span></div>
          <label className={styles.checkField}><input type="checkbox" checked={saveDelivery} onChange={event => setSaveDelivery(event.target.checked)} />{t("Usar uma entrega padrão na minha conta")}</label>
          {saveDelivery && <>
            <p className={styles.helper}>{t("Use dados fictícios nesta demonstração. O frete será recalculado e você revisará tudo antes de confirmar.")}</p>
            <div className={styles.twoColumns}>
              <div className={styles.field}><label htmlFor="default-country">{t("País de destino")}</label><select id="default-country" value={delivery.country} onChange={event => setDelivery({ ...blankDelivery(), country: event.target.value as Country })}>{countries.map(country => <option key={country.code} value={country.code}>{t(country.name)}</option>)}</select></div>
              <div className={styles.field}><label htmlFor="default-region">{t("Região de entrega")}</label><select id="default-region" value={delivery.region} required onChange={event => setDelivery(value => ({ ...value, region: event.target.value }))}><option value="">{t("Selecione uma região")}</option>{regions.map(region => <option key={region.code} value={region.code}>{t(region.name)}</option>)}</select></div>
            </div>
            <div className={styles.twoColumns}>{deliveryFields.map(([key, label, maxLength, autocomplete]) => <div className={styles.field} key={key}><label htmlFor={`default-${key}`}>{t(label)}</label><input id={`default-${key}`} name={key} value={delivery[key]} maxLength={maxLength} autoComplete={autocomplete} disabled={key === "number" && delivery.noNumber} onChange={event => setDelivery(value => ({ ...value, [key]: event.target.value }))} /></div>)}</div>
            <label className={styles.checkField}><input type="checkbox" checked={delivery.noNumber} onChange={event => setDelivery(value => ({ ...value, noNumber: event.target.checked, number: event.target.checked ? "" : value.number }))} />{t("Sem número")}</label>
            <div className={styles.field}><label htmlFor="default-method">{t("Modalidade preferida")}</label><select id="default-method" value={method} onChange={event => setMethod(event.target.value as ShippingMethod)}><option value="standard">{t("Convencional")}</option><option value="express">{t("Expresso")}</option></select></div>
          </>}
          <div className={styles.actions}><button className="btn" type="submit">{t(busy === "save" ? "Salvando…" : "Salvar alterações")}</button><button className="btn btn-secondary" type="button" onClick={() => { setEditing(false); setResponse(""); }}>{t("Cancelar edição")}</button></div>
          </fieldset>
        </form>}
        {response && <p className={styles.response} role="status">{t(response)}</p>}
      </section>
      <div className={styles.stack}>
        <section className={styles.block}><h2>{t("Tudo pronto para o próximo pedido")}</h2><p className={styles.muted}>{t("Escolha seus sabores na compra rápida. Sua entrega padrão será sugerida no checkout, onde você confere endereço, prazo e total.")}</p><a className={styles.inlineLink} href="#compra-rapida">{t("Fazer um pedido")}</a></section>
        <section className={styles.block}><h2>{t("Segurança da conta")}</h2><p className={styles.muted}>{t("Enviaremos um link para o e-mail da sua conta para você escolher uma nova senha.")}</p><Link className={styles.inlineLink} href={href("/recuperar-senha")}>{t("Alterar minha senha")}</Link>{user && <button className="btn btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => void logout()}>{t(busy === "logout" ? "Saindo…" : "Sair da conta")}</button>}</section>
      </div>
    </div>
    <QuickOrder />
    <OrdersSection />
    </>}
  </PageShell>;
}

function blankDelivery(): DeliveryInput { return { country: "BR", region: "", postal: "", street: "", number: "", noNumber: false, complement: "", district: "", city: "", province: "", reference: "", instructions: "" }; }
const deliveryFields = [
  ["postal", "CEP / código postal", 160, "postal-code"], ["street", "Rua / avenida", 300, "address-line1"],
  ["number", "Número", 160, "off"], ["complement", "Complemento", 160, "address-line2"],
  ["district", "Bairro", 160, "address-level3"], ["city", "Cidade", 160, "address-level2"],
  ["province", "Estado / província", 160, "address-level1"], ["reference", "Ponto de referência", 300, "off"],
  ["instructions", "Instruções de entrega", 500, "off"],
] as const;

function SavedDelivery({ delivery, method }: { delivery: DeliveryInput; method: ShippingMethod }) {
  const { t } = useLocale();
  const region = (delivery.country === "BR" ? brazilRegions : internationalRegions[delivery.country]).find(value => value.code === delivery.region);
  const address = [delivery.street, delivery.noNumber ? t("Sem número") : delivery.number, delivery.complement, delivery.district, delivery.city, delivery.province, delivery.postal].filter(Boolean).join(", ");
  return <div className={styles.address}>
    {address && <p>{address}</p>}
    <p>{t(countries.find(value => value.code === delivery.country)?.name ?? delivery.country)} · {t(region?.name ?? delivery.region)}</p>
    {delivery.reference && <p>{t("Ponto de referência")}: {delivery.reference}</p>}
    {delivery.instructions && <p>{t("Instruções de entrega")}: {delivery.instructions}</p>}
    <p>{t(method === "express" ? "Expresso" : "Convencional")}</p>
  </div>;
}

function QuickOrder() {
  const { t, href } = useLocale();
  const router = useRouter(); const store = useStore(); const catalog = useCatalog(); const { user, orders } = useAccount();
  const { attempt, receipt, beginNewPurchase } = useCheckoutDraft();
  const checkoutBlocked = Boolean(attempt || receipt && (!receipt.cartConsumed || receipt.cartPending));
  const [quantities, setQuantities] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [response, setResponse] = useState("");
  const locked = useRef(false); const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (locked.current || !user || orders.length >= 5) return;
    const selected = Object.entries(quantities).filter(([, value]) => Number(value) > 0);
    if (!selected.length || selected.some(([, value]) => !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) { setResponse("Escolha ao menos uma lata para continuar."); return; }
    if (!beginNewPurchase()) { setResponse("Confira a confirmação anterior no checkout antes de iniciar outro pedido."); return; }
    locked.current = true; setBusy(true); setResponse("");
    try {
      await store.addItems(selected.map(([slug, value]) => ({ slug: slug as ProductSlug, quantity: Number(value) })));
      if (active.current) { store.closeCart(); router.push(href("/checkout")); }
    } catch (failure) { if (active.current) setResponse(failure instanceof Error ? failure.message : "Não foi possível adicionar os itens. Tente novamente."); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  };
  return <section id="compra-rapida" className={styles.quickSection} aria-labelledby="quick-order-title">
    <div className={styles.sectionTop}><div><h2 id="quick-order-title">{t("Compra rápida")}</h2><p className={styles.muted}>{t("Monte uma nova combinação e confira tudo antes de confirmar.")}</p></div><Link className={styles.inlineLink} href={href("/produtos")}>{t("Explorar os sabores")}</Link></div>
    {checkoutBlocked && <div className={styles.notice} role="status"><p>{t("Há uma confirmação anterior para conferir. Resolva o resultado ou atualize o carrinho antes de iniciar outro pedido.")}</p><Link className={styles.inlineLink} href={href("/checkout")}>{t("Conferir no checkout")}</Link></div>}
    {catalog.loading ? <p role="status">{t("Carregando catálogo…")}</p> : catalog.error ? <div className={styles.notice} role="alert"><p>{t(catalog.error)}</p><button type="button" className="btn btn-secondary" onClick={() => void catalog.refresh()}>{t("Tentar novamente")}</button></div> : <form onSubmit={submit}>
      <div className={styles.quickGrid}>{catalog.products.map(product => <div className={styles.quickProduct} key={product.slug}>
        <Image src={canArtwork(product.slug)} alt="" width={52} height={110} loading="lazy" /><div><strong>{t(product.name)}</strong><p>{formatPrice(product.priceInCents)} · {product.volumeMl} ml</p><label htmlFor={`quick-${product.slug}`}>{t("Quantidade")}</label><input id={`quick-${product.slug}`} type="number" inputMode="numeric" min="0" step="1" value={quantities[product.slug] ?? "0"} onChange={event => setQuantities(value => ({ ...value, [product.slug]: event.target.value }))} disabled={!product.available || busy || store.loading} />{!product.available && <small>{t("Indisponível")}</small>}</div>
      </div>)}</div>
      <div className={styles.actions}><button className="btn" type="submit" disabled={busy || store.loading || !store.catalogReady || orders.length >= 5 || checkoutBlocked}>{t(busy ? "Adicionando…" : "Adicionar e revisar pedido")}</button><p className={styles.helper}>{t("Os itens escolhidos serão somados ao seu carrinho atual.")}</p></div>
      {user?.defaultDelivery ? <p className={styles.helper}>{t("Sua entrega padrão será sugerida no checkout.")}</p> : <p className={styles.helper}>{t("Você poderá informar a entrega no checkout ou salvá-la no seu perfil.")}</p>}
      {response && <p role="status" className={styles.response}>{t(response)}</p>}
    </form>}
  </section>;
}

function OrdersStatus() {
  const { t } = useLocale();
  const { user, ordersReady, ordersError, refreshOrders } = useAccount();
  if (!user) return null;
  if (!ordersReady) return <p className={styles.notice} role="status">{t("Carregando seus pedidos…")}</p>;
  return <div className={styles.notice} role={ordersError ? "alert" : "status"}>
    <p>{t(ordersError ? "Não foi possível atualizar os pedidos agora. Vamos tentar novamente automaticamente." : "Seus pedidos são atualizados automaticamente.")}</p>
    {ordersError && <button className="btn btn-secondary" type="button" onClick={() => void refreshOrders()}>{t("Tentar novamente")}</button>}
  </div>;
}

function DeliveryDetails({ order }: { order: OrderDto }) {
  const { t } = useLocale();
  const delivery = order.delivery;
  const fields = [
    ["País de destino", t(countries.find(country => country.code === delivery.country)?.name ?? delivery.country)],
    ["Região de entrega", t(delivery.regionName)], ["Zona de entrega", delivery.zone],
    ["Endereço informado ou referência", delivery.resolvedAddress], ["CEP / código postal", delivery.postal],
    ["Número", delivery.noNumber ? t("Sem número") : delivery.number], ["Complemento", delivery.complement],
    ["Bairro", delivery.district], ["Cidade", delivery.city], ["Estado / província", delivery.province],
    ["Ponto de referência", delivery.reference], ["Instruções de entrega", delivery.instructions],
    ["Modalidade", t(delivery.method === "express" ? "Expresso" : "Convencional")],
    ["Frete demonstrativo", formatPrice(delivery.priceInCents)], ["Prazo demonstrativo", businessDaysText(delivery.businessDays,t)],
  ].filter(([,value]) => value);
  return <section><h2>{t("Entrega demonstrativa")}</h2>
    {delivery.referenceApplied && <p className={styles.helper}>{t("Foi utilizado o endereço de referência demonstrativo porque a linha principal ficou vazia.")}</p>}
    <dl className={styles.address}>{fields.map(([label,value]) => <div key={label} style={{ marginBottom: 12 }}><dt><strong>{t(label)}</strong></dt><dd>{value}</dd></div>)}</dl>
  </section>;
}

function OrderSummary({ order, details = false }: { order: OrderDto; details?: boolean }) {
  const { locale, t, href } = useLocale();
  const { deleteOrder } = useAccount();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState("");
  const remove = async () => {
    if (busy) return;
    setBusy(true); setResponse("");
    try { await deleteOrder(order.id); setConfirm(false); }
    catch (failure) { setResponse(failure instanceof Error ? failure.message : "Não foi possível excluir o pedido. Tente novamente."); }
    finally { setBusy(false); }
  };
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  const arrival = estimateArrival(order.createdAt, order.delivery.businessDays);
  const arrivalDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const showArrival = (value: string) => arrivalDate.format(new Date(`${value}T12:00:00Z`));
  return <article className={styles.block}>
    <div className={styles.orderTop}><div><h2 style={{ overflowWrap: "anywhere" }}>{order.number}</h2><time dateTime={order.createdAt}>{date.format(new Date(order.createdAt))}</time></div><span className={styles.badge}>{t("Simulação concluída")}</span></div>
    <div className={styles.arrival}><div><span>{t("Prazo demonstrativo")}</span><strong>{businessDaysText(order.delivery.businessDays, t)}</strong></div><div><span>{t("Previsão de chegada")}</span><strong>{arrival ? arrival.earliest ? <><time dateTime={arrival.earliest}>{showArrival(arrival.earliest)}</time> {t("a")} <time dateTime={arrival.latest}>{showArrival(arrival.latest)}</time></> : <>{t("Até")} <time dateTime={arrival.latest}>{showArrival(arrival.latest)}</time></> : t("Previsão indisponível")}</strong></div><p>{t("Estimativa demonstrativa a partir do pedido, sem sábados, domingos ou ajuste de feriados. Horário de São Paulo; sem rastreamento de transportadora.")}</p></div>
    <div className={styles.items}>{order.items.map(item => <div className={styles.item} key={item.slug}><Image src={canArtwork(item.slug)} alt="" width={80} height={180} /><div><strong>{item.name}</strong><p>{item.quantity} × {formatPrice(item.unitPriceInCents)}</p></div><strong>{formatPrice(item.lineTotalInCents)}</strong></div>)}</div>
    <dl className={styles.totals}><div><dt>{t("Subtotal")}</dt><dd>{formatPrice(order.subtotalInCents)}</dd></div><div><dt>{t("Desconto de atacado")}</dt><dd>− {formatPrice(order.discountInCents)}</dd></div><div><dt>{t("Frete demonstrativo")}</dt><dd>{formatPrice(order.shippingInCents)}</dd></div><div><dt>{t("Total")}</dt><dd>{formatPrice(order.totalInCents)}</dd></div></dl>
    {details && <div className={styles.stack}><DeliveryDetails order={order} /><p className={styles.helper}>{t("Nenhum pagamento ou envio físico foi realizado. Este pedido será removido 24 horas após sua criação.")}</p></div>}
    <p className={styles.helper}>{t("Registro disponível até")} <time dateTime={order.expiresAt}>{date.format(new Date(order.expiresAt))}</time>. {t("Esse prazo é a validade do registro e não a data de entrega.")}</p>
    <div className={styles.actions}>{!details && <Link className="btn btn-secondary" href={href("/pedidos/" + order.id)}>{t("Ver detalhes")}</Link>}<button className={"btn btn-secondary " + styles.delete} type="button" onClick={() => setConfirm(true)}>{t("Excluir ou cancelar pedido")}</button></div>
    {response && <p role="status" className={styles.response}>{t(response)}</p>}
    <Modal open={confirm} onClose={() => { if (!busy) setConfirm(false); }} title={t("Excluir ou cancelar pedido?")}><p className={styles.confirmText}>{t("O pedido e seus dados de entrega serão apagados permanentemente. Nenhum item voltará automaticamente ao carrinho e uma vaga será liberada.")}</p><div className={styles.actions}><button className={"btn btn-secondary " + styles.delete} type="button" disabled={busy} onClick={() => void remove()}>{t(busy ? "Excluindo…" : "Excluir ou cancelar pedido")}</button><button className="btn" type="button" disabled={busy} onClick={() => setConfirm(false)}>{t("Voltar ao pedido")}</button></div></Modal>
  </article>;
}

export function OrdersScreen() {
  return <AccountScreen />;
}

function OrdersSection() {
  const { t, href } = useLocale();
  const { user, orders, ordersReady, ordersError } = useAccount();
  return <section id="meus-pedidos" className={styles.ordersSection} aria-labelledby="my-orders-title">
    <div className={styles.sectionTop}><div><h2 id="my-orders-title">{t("Meus pedidos")}</h2><p className={styles.muted}>{t("Acompanhe as simulações existentes da sua conta.")}</p></div><a className="btn btn-secondary" href="#compra-rapida">{t("Fazer um pedido")}</a></div>
    <div className={styles.toolbar}><p>{t("Até cinco pedidos existentes por conta. Cada pedido é removido após 24 horas.")}</p></div>
    <OrdersStatus />
    {user && orders.length >= 5 && <p className={styles.notice} role="status">{t("Você atingiu o limite de cinco pedidos. Exclua um pedido existente para liberar uma vaga.")}</p>}
    {user && ordersReady && (!ordersError || orders.length > 0) && (orders.length ? <div className={styles.orderList}>{orders.map(order => <OrderSummary key={order.id} order={order} />)}</div> : <div className={styles.empty}><h2>{t("Nenhum pedido por aqui")}</h2><p>{t("Sua próxima combinação começa aqui. Escolha seus sabores.")}</p><Link className="btn" href={href("/produtos")}>{t("Explorar os sabores")}</Link></div>)}
  </section>;
}

export function OrderDetailsScreen({ id, confirmation = false }: { id: string; confirmation?: boolean }) {
  const { t, href } = useLocale();
  const { user, orders, ordersError, getOrder } = useAccount();
  const store = useStore();
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const order = user ? orders.find(item => item.id === id && item.ownerId === user.id && Date.parse(item.expiresAt) > Date.now()) : undefined;
  useEffect(() => {
    let current = true;
    setFailure(null);
    if (!user) { setLoading(false); return; }
    setLoading(true);
    void getOrder(id).catch(cause => { if (current) setFailure(cause instanceof Error ? cause.message : "Não foi possível carregar o pedido. Tente novamente."); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [id,user?.id,getOrder,retry]);
  return <PageShell eyebrow={t("SUA CONTA")} title={t(confirmation ? "Confirmação do pedido" : "Detalhes do pedido")}>
    {!user && <AccessNotice destination="/conta#meus-pedidos" />}
    {user && loading && !order && <p className={styles.notice} role="status">{t("Carregando o pedido…")}</p>}
    {user && order && <>
      {confirmation && <div className={styles.notice} role="status"><h2>{t("Pedido confirmado")}</h2><p>{t("Sua simulação foi registrada. Nenhum pagamento ou envio físico será realizado.")}</p>{store.cart.items.length > 0 && <p>{t("Há itens no seu carrinho. Adições posteriores ao envio foram preservadas.")}</p>}</div>}
      <OrderSummary order={order} details />
      <nav className={styles.actions} aria-label={t("Próximos passos")}><Link className="btn" href={href("/conta#meus-pedidos")}>{t("Ver meus pedidos")}</Link><Link className="btn btn-secondary" href={href("/conta")}>{t("Minha conta")}</Link><Link className="btn btn-secondary" href={href("/produtos")}>{t("Continuar comprando")}</Link>{store.cart.items.length > 0 && <Link className="btn btn-secondary" href={href("/carrinho")}>{t("Ver carrinho")}</Link>}</nav>
    </>}
    {user && !order && !loading && <div className={styles.empty}><h2>{t("Pedido indisponível")}</h2><p role={failure || ordersError ? "alert" : undefined}>{t(failure ?? ordersError ?? "O pedido foi removido, expirou ou não pertence à sua conta.")}</p><div className={styles.actions}><button className="btn btn-secondary" type="button" onClick={() => setRetry(value => value + 1)}>{t("Tentar novamente")}</button><Link className="btn" href={href("/conta#meus-pedidos")}>{t("Voltar aos pedidos")}</Link></div></div>}
  </PageShell>;
}

export function DataPanelScreen() { return <AccountScreen />; }
