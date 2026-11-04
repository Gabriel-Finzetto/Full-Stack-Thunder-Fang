"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { CreateOrderInput, OrderDto, ProfileDto, ProfileUpdate } from "@/contracts/api";
import { defaultDeliverySchema, profileUpdateSchema } from "@/contracts/profile";
import type { Locale } from "@/i18n/config";
import { useLocale } from "@/i18n/locale-context";
import { ACCOUNT_MODE } from "./config";
import { getAuthClient } from "./auth-client";
import { IDENTITY_CHANGE_EVENT, identityChange } from "./identity-transition";
import { AccountRequestError, readOrder, readOrders, responseError, sendOrder } from "./order-data";
import { beginConfirmation, type PendingConfirmation } from "./pending-confirmation";
import { createReadRefresh, visibleAndOnline } from "@/features/read-refresh";
export { AccountRequestError } from "./order-data";

export type DemoUser = ProfileDto;
export type DemoOrder = OrderDto;

type AccountContextValue = {
  mode: typeof ACCOUNT_MODE;
  ready: boolean;
  user: DemoUser | null;
  error: string | null;
  signOutError: string | null;
  pendingConfirmation: PendingConfirmation | null;
  awaitConfirmation: (userId: unknown) => void;
  clearPendingConfirmation: () => void;
  orders: OrderDto[];
  ordersReady: boolean;
  ordersError: string | null;
  realtimeState: "idle" | "connecting" | "live" | "offline";
  refreshProfile: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  getOrder: (id: string) => Promise<OrderDto | null>;
  updateName: (name: string) => Promise<void>;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
  createOrder: (payload: CreateOrderInput, locale?: Locale, expectedOwnerId?: string) => Promise<OrderDto>;
  deleteOrder: (id: string) => Promise<void>;
};
const AccountContext = createContext<AccountContextValue | null>(null);
const unavailable = "Não foi possível consultar sua conta. Tente novamente.";
const expired = "Sua sessão mudou. Entre novamente para continuar.";
const identityId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readProfile(value: unknown): DemoUser {
  if (!value || typeof value !== "object" || !("profile" in value)) throw new Error(unavailable);
  const row = value.profile;
  if (!row || typeof row !== "object" || !("id" in row) || !("name" in row) || !("email" in row)
    || typeof row.id !== "string" || !identityId.test(row.id)
    || typeof row.name !== "string" || !row.name.trim() || row.name.length > 120
    || typeof row.email !== "string" || !row.email || row.email.length > 254) throw new Error(unavailable);
  const saved = 'defaultDelivery' in row ? row.defaultDelivery : null;
  const preference = saved === null ? null : defaultDeliverySchema.safeParse(saved);
  if (preference && !preference.success) throw new Error(unavailable);
  return { id: row.id, name: row.name, email: row.email, defaultDelivery: preference?.success ? preference.data : null };
}

/** Profile authority is the server API, never a decoded or cached browser JWT. */
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const [user, setUser] = useState<DemoUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  // Kept only for this tab's navigation; no password, email or address is stored.
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const awaitConfirmation = useCallback((id: unknown) => setPendingConfirmation(beginConfirmation(id)), []);
  const clearPendingConfirmation = useCallback(() => setPendingConfirmation(null), []);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [ordersReady, setOrdersReady] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<AccountContextValue["realtimeState"]>("idle");
  const mounted = useRef(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const userId = useRef<string | null>(null);
  // Unlike the display/profile cache, this baseline survives refresh invalidation.
  const observedOwner = useRef<string | null | undefined>(undefined);
  const orderEpoch = useRef(0);
  const listVersion = useRef(0);
  const listRequest = useRef<AbortController | null>(null);
  const orderReads = useRef(new Set<AbortController>());
  const profileRefresh = useRef<ReturnType<typeof createReadRefresh> | null>(null);
  const ordersRefresh = useRef<ReturnType<typeof createReadRefresh> | null>(null);
  const profileWriting = useRef(false);

  const cancelOrderReads = useCallback(() => {
    orderEpoch.current += 1;
    listVersion.current += 1;
    orderReads.current.forEach(controller => controller.abort());
    orderReads.current.clear();
    listRequest.current = null;
  }, []);
  const clearOrders = useCallback(() => {
    cancelOrderReads();
    setOrders([]);
    setOrdersReady(false);
    setOrdersError(null);
    setRealtimeState("idle");
  }, [cancelOrderReads]);

  const observeIdentity = useCallback((nextUserId: string | null) => {
    const change = identityChange(observedOwner.current, nextUserId);
    observedOwner.current = nextUserId;
    if (change) {
      setSignOutError(null);
      window.dispatchEvent(new CustomEvent(IDENTITY_CHANGE_EVENT, { detail: change }));
    }
  }, []);

  const clearIdentity = useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    userId.current = null;
    setUser(null);
    clearOrders();
  }, [clearOrders]);

  const rejectSession = useCallback((revalidate: boolean) => {
    observeIdentity(null);
    clearIdentity();
    setError(null);
    setReady(!revalidate);
    if (revalidate) void profileRefresh.current?.request(true);
  }, [clearIdentity, observeIdentity]);

  const readProfileFromServer = useCallback(async () => {
    if (!mounted.current || profileWriting.current) return true;
    const version = ++generation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!mounted.current || version !== generation.current) return true;
      if (response.status === 401) {
        observeIdentity(null);
        clearIdentity();
        setError(null);
        setReady(true);
        return true;
      }
      if (!response.ok) throw new Error(unavailable);
      const profile = readProfile(await response.json());
      if (!mounted.current || version !== generation.current) return true;
      if (userId.current !== profile.id) clearOrders();
      observeIdentity(profile.id);
      userId.current = profile.id;
      setUser(previous => previous?.id === profile.id && previous.name === profile.name && previous.email === profile.email && JSON.stringify(previous.defaultDelivery) === JSON.stringify(profile.defaultDelivery) ? previous : profile);
      setError(null);
      return true;
    } catch {
      if (!mounted.current || version !== generation.current) return true;
      // A transport failure is not a logout. Keep only the same owner's last
      // server-validated display; every private operation is still authorized.
      setError(unavailable);
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (mounted.current && version === generation.current) {
        setReady(true);
        if (request.current === controller) request.current = null;
      }
    }
  }, [observeIdentity, clearIdentity, clearOrders]);

  const refreshProfile = useCallback(async () => { await profileRefresh.current?.request(true); }, []);

  useEffect(() => {
    mounted.current = true;
    const automatic = createReadRefresh(readProfileFromServer, { active: visibleAndOnline, interval:60_000 });
    profileRefresh.current = automatic;
    let scheduled: number | undefined;
    const scheduleRefresh = (force = false) => {
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(() => { void automatic.request(force); }, 0);
    };
    const invalidate = () => {
      clearIdentity();
      setReady(false);
      setError(null);
      scheduleRefresh(true);
    };
    const focus = () => {
      if (navigator.onLine === false) { setError(unavailable); setReady(true); }
      void automatic.request();
    };
    const online = () => { void automatic.request(true); };
    // A restored page can retain another tab's pre-logout private React state.
    // Clear it before revalidating rather than trusting the frozen snapshot.
    const restored = (event: PageTransitionEvent) => { if (event.persisted) invalidate(); };
    let unsubscribe: (() => void) | undefined;
    try {
      const { data } = getAuthClient().auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        // Defer network/SDK work until after Supabase releases its auth lock.
        // A changed SDK identity only clears data; the API still authorizes the profile.
        const hintedId = session?.user?.id;
        if (event === "SIGNED_OUT") {
          observeIdentity(null);
          clearIdentity();
          setError(null);
          window.clearTimeout(scheduled);
          setReady(true);
        } else {
          const changedOwner = typeof hintedId === "string" && identityId.test(hintedId) && hintedId !== userId.current;
          if (changedOwner) {
            // An SDK hint can invalidate another owner's UI, never authorize it.
            observeIdentity(hintedId);
            clearIdentity();
            setReady(false);
          }
          scheduleRefresh(changedOwner);
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      scheduleRefresh();
      if (navigator.onLine === false) focus();
    } catch {
      setError(unavailable);
      setReady(true);
    }
    window.addEventListener("thunderfang:sessionchange", invalidate);
    window.addEventListener("focus", focus);
    window.addEventListener("online", online);
    window.addEventListener("offline", focus);
    window.addEventListener("pageshow", restored);
    document.addEventListener("visibilitychange", focus);
    return () => {
      mounted.current = false;
      automatic.stop();
      profileRefresh.current = null;
      generation.current += 1;
      request.current?.abort();
      cancelOrderReads();
      window.clearTimeout(scheduled);
      unsubscribe?.();
      window.removeEventListener("thunderfang:sessionchange", invalidate);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", focus);
      window.removeEventListener("pageshow", restored);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [clearIdentity, readProfileFromServer, observeIdentity, cancelOrderReads]);

  const readOrdersFromServer = useCallback(async () => {
    const owner = userId.current;
    if (!mounted.current || !owner) return true;
    const epoch = orderEpoch.current;
    const version = ++listVersion.current;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    orderReads.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const current = () => mounted.current && epoch === orderEpoch.current && version === listVersion.current && userId.current === owner;
    try {
      const response = await fetch("/api/orders?limit=5", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!current()) return true;
      if (response.status === 401) { observeIdentity(null); clearIdentity(); setReady(true); return true; }
      if (!response.ok) throw await responseError(response);
      const page = readOrders(await response.json(), owner);
      if (!current()) return true;
      setOrders(page.orders);
      setOrdersError(null);
      return true;
    } catch (failure) {
      if (!current()) return true;
      setOrdersError(failure instanceof AccountRequestError ? failure.message : "Não foi possível consultar seus pedidos. Tente novamente.");
      return false;
    } finally {
      window.clearTimeout(timeout);
      orderReads.current.delete(controller);
      if (current()) setOrdersReady(true);
      if (listRequest.current === controller) listRequest.current = null;
    }
  }, [clearIdentity, observeIdentity]);

  const refreshOrders = useCallback(async () => { await ordersRefresh.current?.request(true); }, []);

  const getOrder = useCallback(async (id: string): Promise<OrderDto | null> => {
    const owner = userId.current;
    if (!owner) throw new AccountRequestError("AUTH_REQUIRED", 401);
    if (!identityId.test(id)) return null;
    const epoch = orderEpoch.current;
    const controller = new AbortController();
    orderReads.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!mounted.current || epoch !== orderEpoch.current || userId.current !== owner) throw new AccountRequestError("SESSION_CHANGED",409);
      if (response.status === 404) { setOrders(current => current.filter(order => order.id !== id)); return null; }
      if (response.status === 401) { observeIdentity(null); clearIdentity(); setReady(true); throw new AccountRequestError("SESSION_EXPIRED",401); }
      if (!response.ok) throw await responseError(response);
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || !("order" in value)) throw new AccountRequestError("INVALID_RESPONSE",503);
      const order = readOrder(value.order,owner);
      if (!mounted.current || epoch !== orderEpoch.current || userId.current !== owner) throw new AccountRequestError("SESSION_CHANGED",409);
      if (order?.id !== id) { if (order) throw new AccountRequestError("INVALID_RESPONSE",503); return null; }
      setOrders(current => [order, ...current.filter(row => row.id !== id)].sort((left,right) => right.createdAt.localeCompare(left.createdAt)));
      return order;
    } catch (failure) {
      if (failure instanceof AccountRequestError) throw failure;
      throw new AccountRequestError("SERVICE_UNAVAILABLE",503);
    } finally { window.clearTimeout(timeout); orderReads.current.delete(controller); }
  }, [clearIdentity, observeIdentity]);

  const createOrder = useCallback(async (input: CreateOrderInput, language: Locale = locale, expectedOwnerId?: string): Promise<OrderDto> => {
    const owner = userId.current;
    if (!owner) throw new AccountRequestError("AUTH_REQUIRED",401);
    if (expectedOwnerId && expectedOwnerId !== owner) throw new AccountRequestError("SESSION_CHANGED",409);
    const epoch = orderEpoch.current;
    let order: OrderDto;
    try { order = await sendOrder(input,language,owner); }
    catch (failure) {
      if (mounted.current && epoch === orderEpoch.current && userId.current === owner && failure instanceof AccountRequestError
        && (failure.status === 401 || failure.code === "SESSION_CHANGED")) rejectSession(failure.code === "SESSION_CHANGED");
      throw failure;
    }
    // A completed response cannot repopulate private cache after an identity invalidation.
    if (!mounted.current || epoch !== orderEpoch.current || userId.current !== owner || observedOwner.current !== owner) throw new AccountRequestError("ORDER_RESULT_UNKNOWN");
    cancelOrderReads();
    setOrders(current => [order,...current.filter(row => row.id !== order.id && Date.parse(row.expiresAt) > Date.now())].sort((left,right) => right.createdAt.localeCompare(left.createdAt)));
    setOrdersReady(true);
    setOrdersError(null);
    // The committed purchase stays successful even when this separate refresh fails.
    void refreshOrders();
    return order;
  }, [cancelOrderReads, refreshOrders, locale, rejectSession]);

  const deleteOrder = useCallback(async (id: string) => {
    const owner = userId.current;
    if (!owner) throw new AccountRequestError("AUTH_REQUIRED",401);
    if (!identityId.test(id)) throw new AccountRequestError("NOT_FOUND",404);
    const epoch = orderEpoch.current;
    let response: Response;
    try { response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin", cache: "no-store", headers: { "X-TF-Account": owner }, signal: AbortSignal.timeout(15_000) }); }
    catch { throw new AccountRequestError("SERVICE_UNAVAILABLE",503); }
    if (!mounted.current || epoch !== orderEpoch.current || userId.current !== owner || observedOwner.current !== owner) throw new AccountRequestError("SESSION_CHANGED",409);
    if (response.status !== 204 && response.status !== 404) {
      const failure = await responseError(response);
      if (mounted.current && epoch === orderEpoch.current && userId.current === owner
        && (failure.status === 401 || failure.code === "SESSION_CHANGED")) rejectSession(failure.code === "SESSION_CHANGED");
      throw failure;
    }
    cancelOrderReads();
    setOrders(current => current.filter(order => order.id !== id));
    setOrdersReady(true);
    setOrdersError(null);
    void refreshOrders();
  }, [cancelOrderReads, refreshOrders, rejectSession]);

  const ownerId = user?.id ?? null;
  useEffect(() => {
    if (!ownerId) return;
    const owner = ownerId;
    const automatic = createReadRefresh(readOrdersFromServer, { active: () => visibleAndOnline() && userId.current === owner });
    ordersRefresh.current = automatic;
    let closed = false;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<ReturnType<typeof getAuthClient>["channel"]> | undefined;
    const reconcile = () => {
      if (closed || userId.current !== owner) return;
      void automatic.request();
    };
    const notify = () => { clearTimeout(deferred); deferred = setTimeout(reconcile,120); };
    setOrdersReady(false);
    setRealtimeState("connecting");
    void automatic.request();
    try {
      const client = getAuthClient();
      void client.realtime.setAuth().then(() => {
        if (closed || userId.current !== owner) return;
        channel = client.channel(`tf:orders:${owner}`, { config: { private: true } })
          .on("broadcast", { event: "orders_changed" }, notify)
          .subscribe((status: string) => {
            if (closed || userId.current !== owner) return;
            setRealtimeState(status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED" ? "offline" : "connecting");
            if (status === "SUBSCRIBED") notify();
          });
      }).catch(() => { if (!closed) setRealtimeState("offline"); });
    } catch { setRealtimeState("offline"); }
    // Reconciliation is a fallback; only an actual subscription is labelled live.
    window.addEventListener("online", reconcile);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      closed = true;
      clearTimeout(deferred);
      automatic.stop();
      if (ordersRefresh.current === automatic) ordersRefresh.current = null;
      window.removeEventListener("online", reconcile);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      if (channel) { try { void getAuthClient().removeChannel(channel); } catch { /* No data is retained by this component. */ } }
    };
  }, [ownerId, readOrdersFromServer]);

  useEffect(() => {
    if (!orders.length) return;
    const remaining = Math.max(0,Math.min(...orders.map(order => Date.parse(order.expiresAt))) - Date.now()) + 5;
    const timer = setTimeout(() => { setOrders(current => current.filter(order => Date.parse(order.expiresAt) > Date.now())); void refreshOrders(); },remaining);
    return () => clearTimeout(timer);
  }, [orders, refreshOrders]);

  const updateProfile = useCallback(async (input: ProfileUpdate) => {
    const owner = userId.current;
    if (!owner) throw new Error(expired);
    if (profileWriting.current) throw new Error("Aguarde a atualização em andamento.");
    const parsed = profileUpdateSchema.safeParse(input);
    if (!parsed.success) throw new Error("Confira os dados do perfil e da entrega padrão.");
    const version = ++generation.current;
    profileWriting.current = true;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-TF-Account": owner }, body: JSON.stringify(parsed.data), signal: controller.signal,
      });
      if (!mounted.current || version !== generation.current || owner !== userId.current) throw new Error(expired);
      if (response.status === 401) {
        observeIdentity(null);
        clearIdentity();
        setReady(true);
        throw new Error(expired);
      }
      if (!response.ok) {
        const failure = await responseError(response);
        if (!mounted.current || version !== generation.current || owner !== userId.current) throw new Error(expired);
        if (failure.code === "SESSION_CHANGED") {
          rejectSession(true);
          throw new Error(expired);
        }
        throw new Error("Não foi possível atualizar seu perfil. Tente novamente.");
      }
      const profile = readProfile(await response.json());
      if (!mounted.current || version !== generation.current || owner !== userId.current || profile.id !== owner) throw new Error(expired);
      setUser(profile);
      setError(null);
    } catch (failure) {
      if (failure instanceof Error && failure.message === expired) throw failure;
      throw new Error("Não foi possível atualizar seu perfil. Tente novamente.");
    } finally {
      window.clearTimeout(timeout);
      profileWriting.current = false;
      if (request.current === controller) request.current = null;
      if (mounted.current && version !== generation.current) void profileRefresh.current?.request(true);
    }
  }, [clearIdentity, observeIdentity, rejectSession]);

  const updateName = useCallback(async (name: string) => updateProfile({ name }), [updateProfile]);

  const signOut = useCallback(async () => {
    const owner = observedOwner.current;
    const epoch = orderEpoch.current;
    // SIGNED_OUT may leave no local owner. A later login, even to the same ID,
    // is a separate operation and must not be cleared by this late completion.
    const current = () => observedOwner.current === null || observedOwner.current === owner && orderEpoch.current === epoch;
    setSignOutError(null);
    try {
      const { error: failure } = await getAuthClient().auth.signOut({ scope: "local" });
      if (failure) throw failure;
      if (!current()) throw new Error(expired);
      observeIdentity(null);
      clearIdentity();
      clearPendingConfirmation();
      setError(null);
      setReady(true);
      window.dispatchEvent(new Event("thunderfang:sessionchange"));
    } catch {
      // SDK errors can follow SIGNED_OUT and removal of the local session.
      // Keep that feedback outside the account menu, without attributing it to a new owner.
      if (!current()) throw new Error(expired);
      const localSessionEnded = observedOwner.current === null && userId.current === null;
      if (localSessionEnded) clearPendingConfirmation();
      const message = localSessionEnded ? "Você saiu deste navegador, mas não foi possível confirmar a saída no servidor." : "Não foi possível sair da conta. Tente novamente.";
      setSignOutError(message);
      throw new Error(message);
    }
  }, [clearIdentity, observeIdentity, clearPendingConfirmation]);

  const value = useMemo<AccountContextValue>(() => ({
    mode: ACCOUNT_MODE, ready, user, error, signOutError, pendingConfirmation, awaitConfirmation, clearPendingConfirmation, orders, ordersReady, ordersError, realtimeState,
    refreshProfile, refreshOrders, getOrder, updateName, updateProfile, signOut, createOrder, deleteOrder,
  }), [ready, user, error, signOutError, pendingConfirmation, awaitConfirmation, clearPendingConfirmation, orders, ordersReady, ordersError, realtimeState, refreshProfile, refreshOrders, getOrder, updateName, updateProfile, signOut, createOrder, deleteOrder]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount requires AccountProvider");
  return value;
}
