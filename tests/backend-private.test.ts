import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthActor, CheckoutQuoteDto, CreateOrderInput, OrderDto } from '../src/contracts/api';
import { createPrivateServices, type PrivateRepository } from '../src/server/private-services';
import { ApiError } from '../src/server/errors';
import { assertCurrentCheckoutReview as assertCheckoutReview } from '../src/server/quotes';
import { authenticateRequest, createPrivateRepository } from '../src/server/supabase';

vi.mock('../src/server/quotes', () => ({ assertCurrentCheckoutReview: vi.fn() }));
const clientMocks = vi.hoisted(() => ({ browser: vi.fn(), server: vi.fn(), cookies: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: clientMocks.browser }));
vi.mock('@supabase/ssr', () => ({ createServerClient: clientMocks.server }));
vi.mock('next/headers', () => ({ cookies: clientMocks.cookies }));

const actor: AuthActor = { id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.test' };
const stranger = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-10-28T14:00:00.000Z');
const delivery = {
  country: 'BR' as const, region: 'SP-CAPITAL', postal: '', street: 'Rua de teste', number: '', noNumber: false,
  complement: '', district: '', city: '', province: '', reference: 'Porta azul', instructions: 'Referência fictícia',
  regionName: 'São Paulo capital', zone: 'BR' as const, resolvedAddress: 'Rua de teste', referenceApplied: false,
  method: 'standard' as const, priceInCents: 800, businessDays: { min: null, max: 7 },
};
const quote: CheckoutQuoteDto = {
  items: [{ slug: 'original', name: 'Original', quantity: 1, unitPriceInCents: 1279, lineTotalInCents: 1279 }],
  quantity: 1, subtotalInCents: 1279, discountInCents: 0, productsTotalInCents: 1279,
  currency: 'BRL', shippingInCents: 800, totalInCents: 2079, delivery,
  reviewToken: 'verified-review', reviewExpiresAt: '2026-10-28T14:15:00.000Z',
};
const input: CreateOrderInput = {
  items: [{ slug: 'original', quantity: 1 }], delivery, method: 'standard', reviewToken: 'submitted-review',
};

function order(overrides: Partial<OrderDto> = {}): OrderDto {
  const { reviewToken: _token, reviewExpiresAt: _expiry, ...draft } = structuredClone(quote);
  return {
    ...draft, id: '00000000-0000-4000-8000-000000000010', number: 'TF-TEST-10', ownerId: actor.id,
    status: 'simulation_completed', createdAt: '2026-10-28T13:00:00.000Z', expiresAt: '2026-10-29T13:00:00.000Z',
    ...overrides,
  };
}

function repository(): PrivateRepository {
  return {
    getProfile: vi.fn(async () => ({ id: actor.id, name: 'Nome privado', email: 'untrusted@example.test' })),
    updateProfile: vi.fn(async (_actor, name) => ({ id: actor.id, name, email: actor.email })),
    listOrders: vi.fn(async () => []), getOrder: vi.fn(async () => order()),
    createOrder: vi.fn(async () => order()), deleteOrder: vi.fn(async () => true),
  };
}

beforeEach(() => { vi.mocked(assertCheckoutReview).mockReset(); vi.mocked(assertCheckoutReview).mockResolvedValue(structuredClone(quote)); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('serviços privados de conta e pedidos', () => {
  it('não aplica um formulário de perfil nem exclusão de outra sessão ao ator atual', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo);
    await expect(services.updateProfile('Nome da sessão anterior', stranger)).rejects.toMatchObject({ status: 409, code: 'SESSION_CHANGED' });
    await expect(services.deleteOrder(order().id, stranger)).rejects.toMatchObject({ status: 409, code: 'SESSION_CHANGED' });
    expect(repo.updateProfile).not.toHaveBeenCalled();
    expect(repo.deleteOrder).not.toHaveBeenCalled();
    await expect(services.updateProfile('Nome atual', actor.id)).resolves.toMatchObject({ id: actor.id, name: 'Nome atual' });
    await expect(services.deleteOrder(order().id, actor.id)).resolves.toBeUndefined();
  });

  it('recusa uma compra revisada em outra conta antes de validar ou gravar', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo);
    await expect(services.createOrder(input, 'pt-BR', stranger)).rejects.toMatchObject({ status: 409, code: 'SESSION_CHANGED' });
    expect(repo.createOrder).not.toHaveBeenCalled();
    expect(assertCheckoutReview).not.toHaveBeenCalled();
  });
  it('não aceita identidade sem identificador de usuário válido', () => {
    expect(() => createPrivateServices({ id: 'client-owner', email: actor.email }, repository())).toThrowError(ApiError);
  });

  it('usa identidade e e-mail da autenticação verificada, não do registro de perfil', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo);
    await expect(services.getProfile()).resolves.toEqual({ id: actor.id, name: 'Nome privado', email: actor.email });
    expect(repo.getProfile).toHaveBeenCalledWith(actor);
    vi.mocked(repo.getProfile).mockResolvedValue({ id: stranger, name: 'Outro usuário', email: 'other@example.test' });
    await expect(services.getProfile()).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('atualiza somente o nome validado e recusa um nome vazio antes de consultar o banco', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo);
    await expect(services.updateProfile('   ')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(repo.updateProfile).not.toHaveBeenCalled();
    await expect(services.updateProfile('  Novo nome  ')).resolves.toMatchObject({ id: actor.id, name: 'Novo nome' });
    expect(repo.updateProfile).toHaveBeenCalledWith(actor, 'Novo nome');
  });

  it('salva e remove a entrega padrão somente para o ator verificado', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo);
    const {regionName:_region,zone:_zone,resolvedAddress:_address,referenceApplied:_applied,priceInCents:_price,businessDays:_days,method,...address} = delivery;
    const preference = {delivery:address,method};
    vi.mocked(repo.updateProfile).mockImplementation(async (owner,name,defaultDelivery) => ({id:owner.id,name,email:owner.email,defaultDelivery}));
    await expect(services.updateProfile('Nome',actor.id,preference)).resolves.toMatchObject({defaultDelivery:preference});
    expect(repo.updateProfile).toHaveBeenLastCalledWith(actor,'Nome',preference);
    await expect(services.updateProfile('Nome',stranger,null)).rejects.toMatchObject({code:'SESSION_CHANGED'});
    await expect(services.updateProfile('Nome',actor.id,null)).resolves.toMatchObject({defaultDelivery:null});
    await expect(services.updateProfile('Nome',actor.id,{...preference,delivery:{...address,region:'US-CA'}})).rejects.toMatchObject({code:'INVALID_INPUT'});
  });

  it('não revela um pedido de outra conta, expirado, ausente ou com ID diferente', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo, { now: () => now });
    for (const result of [order({ ownerId: stranger }), order({ expiresAt: now.toISOString() }), null, order({ id: stranger })]) {
      vi.mocked(repo.getOrder).mockResolvedValue(result);
      await expect(services.getOrder(order().id)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    }
    const calls = vi.mocked(repo.getOrder).mock.calls;
    expect(calls.every(([owner, , at]) => owner.id === actor.id && at === now.toISOString())).toBe(true);
  });

  it('filtra a saída de pedidos por proprietário e expiração também no serviço', async () => {
    const repo = repository();
    vi.mocked(repo.listOrders).mockResolvedValue([order(), order({ ownerId: stranger }), order({ expiresAt: now.toISOString() })]);
    const result = await createPrivateServices(actor, repo, { now: () => now }).listOrders();
    expect(result.orders).toEqual([order()]);
    expect(result.nextCursor).toBeNull();
  });

  it('mantém cursor opaco de paginação estável sem aceitar filtros injetados', async () => {
    const repo = repository();
    const first = order({ createdAt: '2026-10-28T13:00:00.123456Z' });
    vi.mocked(repo.listOrders).mockResolvedValue([first, order({ id: stranger })]);
    const services = createPrivateServices(actor, repo, { now: () => now });
    const page = await services.listOrders({ limit: 1 });
    expect(page.orders).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    await services.listOrders({ limit: 1, cursor: page.nextCursor });
    expect(repo.listOrders).toHaveBeenLastCalledWith(actor, {
      limit: 2, cursor: { createdAt: first.createdAt, id: first.id }, now: now.toISOString(),
    });
    const callsBefore = vi.mocked(repo.listOrders).mock.calls.length;
    const invalid = Buffer.from(JSON.stringify({ v: 1, createdAt: 'x),user_id.eq.someone', id: actor.id })).toString('base64url');
    await expect(services.listOrders({ limit: 1, cursor: invalid })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(repo.listOrders).toHaveBeenCalledTimes(callsBefore);
  });

  it('rejeita paginação fora da faixa antes de consultar o repositório', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo);
    for (const limit of [0, 6, 1.5, Number.NaN]) await expect(services.listOrders({ limit })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(repo.listOrders).not.toHaveBeenCalled();
  });

  it('verifica a revisão antes da escrita e envia apenas o cálculo autorizado à transação', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo, { now: () => now });
    const result = await services.createOrder(input, 'en');
    expect(assertCheckoutReview).toHaveBeenCalledWith(input, input.reviewToken, 'en');
    expect(result.id).toBe(order().id);
    const [, draft] = vi.mocked(repo.createOrder).mock.calls[0];
    expect(draft.totalInCents).toBe(2079);
    expect(draft.delivery.reference).toBe('Porta azul');
    expect(draft).not.toHaveProperty('reviewToken');
    expect(draft).not.toHaveProperty('ownerId');
    expect(repo.createOrder).toHaveBeenCalledTimes(1);
    expect(repo.listOrders).not.toHaveBeenCalled();
    expect(vi.mocked(assertCheckoutReview).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(repo.createOrder).mock.invocationCallOrder[0]);
  });

  it('uma revisão inválida impede a transação, e falhas da transação não são reenviadas automaticamente', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo, { now: () => now });
    vi.mocked(assertCheckoutReview).mockImplementation(() => { throw new ApiError(409, 'QUOTE_CHANGED', 'Revisão alterada.'); });
    await expect(services.createOrder(input)).rejects.toMatchObject({ code: 'QUOTE_CHANGED' });
    expect(repo.createOrder).not.toHaveBeenCalled();
    vi.mocked(assertCheckoutReview).mockResolvedValue(structuredClone(quote));
    vi.mocked(repo.createOrder).mockRejectedValue(new ApiError(409, 'ORDER_LIMIT_REACHED', 'Limite atingido.'));
    await expect(services.createOrder(input)).rejects.toMatchObject({ code: 'ORDER_LIMIT_REACHED' });
    expect(repo.createOrder).toHaveBeenCalledTimes(1);
  });

  it('dois envios iguais são duas operações independentes sem deduplicação na aplicação', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo, { now: () => now });
    await services.createOrder(input);
    await services.createOrder(input);
    expect(repo.createOrder).toHaveBeenCalledTimes(2);
    expect(repo.listOrders).not.toHaveBeenCalled();
  });

  it('uma exclusão ausente retorna o mesmo erro de recurso não encontrado e não repõe itens', async () => {
    const repo = repository();
    const services = createPrivateServices(actor, repo);
    await expect(services.deleteOrder(order().id)).resolves.toBeUndefined();
    vi.mocked(repo.deleteOrder).mockResolvedValue(false);
    await expect(services.deleteOrder(order().id)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(repo.deleteOrder).toHaveBeenCalledTimes(2);
    expect(repo.deleteOrder).toHaveBeenLastCalledWith(actor, order().id);
    expect(repo.createOrder).not.toHaveBeenCalled();
  });
});

describe('adaptador de autenticação e persistência do servidor', () => {
  const userClient = { auth: { getUser: vi.fn() }, from: vi.fn() };
  const adminClient = { rpc: vi.fn() };
  const cookieStore = { getAll: vi.fn(() => [{ name: 'sb-demo-auth-token.0', value: 'opaque-session' }]), set: vi.fn() };

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-test');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'secret-test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    userClient.auth.getUser.mockReset().mockResolvedValue({
      data: { user: { id: actor.id, email: actor.email, email_confirmed_at: now.toISOString(), user_metadata: { id: stranger } } }, error: null,
    });
    userClient.from.mockReset(); adminClient.rpc.mockReset(); cookieStore.set.mockReset();
    clientMocks.browser.mockReset().mockImplementation((_url, key) => key === 'secret-test' ? adminClient : userClient);
    clientMocks.server.mockReset().mockReturnValue(userClient);
    clientMocks.cookies.mockReset().mockResolvedValue(cookieStore);
  });

  const bearerRequest = () => new Request('https://example.test/api/orders', { headers: { Authorization: 'Bearer signed-access-token' } });

  it('recusa ausência de credenciais e autorização malformada antes de criar clientes ou acessar configuração', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    for (const headers of [new Headers(), new Headers({ authorization: 'client-owner' })]) {
      await expect(authenticateRequest(new Request('https://example.test/api/orders', { headers }))).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
    }
    expect(clientMocks.browser).not.toHaveBeenCalled();
    expect(clientMocks.server).not.toHaveBeenCalled();
  });

  it('valida o bearer com getUser e usa o identificador verificado, ignorando os metadados editáveis', async () => {
    const request = bearerRequest();
    await expect(authenticateRequest(request)).resolves.toEqual(actor);
    await expect(authenticateRequest(request)).resolves.toEqual(actor);
    expect(userClient.auth.getUser).toHaveBeenCalledExactlyOnceWith('signed-access-token');
    expect(clientMocks.browser).toHaveBeenCalledWith('https://project.supabase.co', 'publishable-test', expect.objectContaining({
      global: expect.objectContaining({ headers: { Authorization: 'Bearer signed-access-token' } }),
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }));
    await authenticateRequest(bearerRequest());
    expect(userClient.auth.getUser).toHaveBeenCalledTimes(2);
  });

  it('usa cookies SSR por requisição e preserva as atualizações de cookies do serviço', async () => {
    const request = new Request('https://example.test/api/profile', { headers: { cookie: 'sb-demo-auth-token.0=opaque-session' } });
    await expect(authenticateRequest(request)).resolves.toEqual(actor);
    expect(userClient.auth.getUser).toHaveBeenCalledWith();
    const options = clientMocks.server.mock.calls[0][2];
    expect(options.cookies.getAll()).toEqual(cookieStore.getAll());
    options.cookies.setAll([{ name: 'sb-demo-auth-token.0', value: 'refreshed', options: { path: '/', httpOnly: true } }], { 'Cache-Control': 'no-store' });
    expect(cookieStore.set).toHaveBeenCalledWith('sb-demo-auth-token.0', 'refreshed', { path: '/', httpOnly: true });
  });

  it.each(['http:', 'https:', 'HTTPS:'])('renova cookies das APIs com a política Secure da origem confiável (%s)', async protocol => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', `${protocol}//example.test`);
    await authenticateRequest(new Request(`${protocol}//example.test/api/profile`, { headers: { cookie: 'sb-demo-auth-token=isolated-session' } }));
    expect(clientMocks.server).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({
      cookieOptions: { path: '/', sameSite: 'lax', secure: protocol.toLowerCase() === 'https:' },
    }));
  });

  it('não autentica e-mail não confirmado nem transforma indisponibilidade de Auth em sessão válida', async () => {
    userClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: actor.id, email: actor.email } }, error: null });
    await expect(authenticateRequest(bearerRequest())).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
    userClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 503, message: 'secret infrastructure detail' } });
    await expect(authenticateRequest(bearerRequest())).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it('aplica proprietário, validade e ID nos filtros de leitura mesmo com RLS também previsto no banco', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), gt: vi.fn(), maybeSingle: vi.fn(async () => ({ data: null, error: null })) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.gt.mockReturnValue(query);
    userClient.from.mockReturnValue(query);
    const request = bearerRequest();
    const repo = await createPrivateRepository(request, await authenticateRequest(request));
    await expect(repo.getOrder(actor, order().id, now.toISOString())).resolves.toBeNull();
    expect(userClient.from).toHaveBeenCalledWith('orders');
    expect(query.eq).toHaveBeenCalledWith('user_id', actor.id);
    expect(query.eq).toHaveBeenCalledWith('id', order().id);
    expect(query.gt).toHaveBeenCalledWith('expires_at', now.toISOString());
  });

  it('não bloqueia a conta por uma preferência opcional inválida e filtra o perfil pelo ator', async () => {
    const query = { select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(async()=>({data:{id:actor.id,name:'Nome',default_delivery:{delivery:{street:123}}},error:null})) };
    query.select.mockReturnValue(query);query.eq.mockReturnValue(query);userClient.from.mockReturnValue(query);
    const request = bearerRequest();
    const repo = await createPrivateRepository(request,await authenticateRequest(request));
    await expect(repo.getProfile(actor)).resolves.toEqual({id:actor.id,name:'Nome',email:actor.email,defaultDelivery:null});
    expect(query.eq).toHaveBeenCalledWith('id',actor.id);
    expect(query.select).toHaveBeenCalledWith('id,name,default_delivery');
  });

  it('envia a criação uma vez à RPC administrativa com o proprietário verificado e mantém os dados completos', async () => {
    const retry = vi.fn(async () => ({ data: order(), error: null }));
    adminClient.rpc.mockReturnValue({ retry });
    const request = bearerRequest();
    const repo = await createPrivateRepository(request, await authenticateRequest(request));
    const { reviewToken: _token, reviewExpiresAt: _expiry, ...draft } = quote;
    await expect(repo.createOrder(actor, draft)).resolves.toEqual(order());
    expect(adminClient.rpc).toHaveBeenCalledExactlyOnceWith('tf_create_order', { p_user_id: actor.id, p_order: draft });
    expect(retry).toHaveBeenCalledExactlyOnceWith(false);
    expect(clientMocks.browser).toHaveBeenLastCalledWith('https://project.supabase.co', 'secret-test', expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }));
  });

  it('não substitui a transação por uma gravação alternativa quando a chave privada ou a RPC estão indisponíveis', async () => {
    const request = bearerRequest();
    const repo = await createPrivateRepository(request, await authenticateRequest(request));
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    await expect(repo.deleteOrder(actor, order().id)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(adminClient.rpc).not.toHaveBeenCalled();
    vi.stubEnv('SUPABASE_SECRET_KEY', 'secret-test');
    adminClient.rpc.mockReturnValue({ retry: vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'internal schema and key details' } })) });
    await expect(repo.deleteOrder(actor, order().id)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(adminClient.rpc).toHaveBeenCalledTimes(1);
  });

  it('envia chaves modernas somente em apikey e preserva o Bearer real do usuário e a chave JWT legada', async () => {
    await authenticateRequest(bearerRequest());
    const network = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', network);
    const fetcher = clientMocks.browser.mock.calls[0][2].global.fetch;
    for (const [key, authorization, expectedAuthorization] of [
      ['sb_secret_test', 'Bearer sb_secret_test', null],
      ['sb_publishable_test', 'Bearer signed-user-token', 'Bearer signed-user-token'],
      ['legacy-jwt', 'Bearer legacy-jwt', 'Bearer legacy-jwt'],
    ]) {
      await fetcher('https://project.supabase.co/rest/v1/orders', { headers: { apikey: key, Authorization: authorization } });
      const options = network.mock.calls.at(-1)![1]!;
      expect(new Headers(options.headers).get('apikey')).toBe(key);
      expect(new Headers(options.headers).get('Authorization')).toBe(expectedAuthorization);
      expect(options.cache).toBe('no-store');
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
