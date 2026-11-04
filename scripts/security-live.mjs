/** Scoped security acceptance: exactly two new Auth fixtures, one order, no SMTP. */
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes('--allow-test-users')) throw new Error('Explicit isolated-fixture opt-in required.');
const site = new URL(process.env.NEXT_PUBLIC_SITE_URL);
const target = new URL(process.env.SECURITY_TEST_BASE_URL || 'http://127.0.0.1:3000');
if (![site, target].every(value => ['127.0.0.1', 'localhost', '[::1]'].includes(value.hostname) && ['http:', 'https:'].includes(value.protocol) && !value.username && !value.password)) throw new Error('Only loopback application targets are allowed.');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !secret) throw new Error('Required integration configuration is missing.');

const transport = (input, init = {}) => {
  const headers = new Headers(init.headers);
  const apiKey = headers.get('apikey');
  if ((apiKey?.startsWith('sb_secret_') || apiKey?.startsWith('sb_publishable_')) && headers.get('authorization') === `Bearer ${apiKey}`) headers.delete('authorization');
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000);
  return fetch(input, { ...init, headers, signal, cache: 'no-store', redirect: 'error' });
};
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false }, global: { fetch: transport } };
const admin = createClient(url, secret, options);
const fixtures = [];
const orderIds = [];
const report = { scope: 'security-and-privacy-only', startedAt: new Date().toISOString(), checks: [], optional: [], fixtureCounts: { usersCreated: 0, ordersCreated: 0 }, smtpSent: false, cleanup: null };
let orderId;
let first;
let second;
let quote;
const notifications = [];
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
const safeCode = error => /^[A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : error?.name || 'CHECK_FAILED';
const status = (result, expected) => ensure(result.status === expected, `HTTP_${result.status}_EXPECTED_${expected}`);

async function check(name, run, required = true) {
  try {
    const result = await run();
    if (result?.skipped) { report.checks.push({ name, passed: null, required: false, status: 'skipped', reason: result.skipped }); console.log(`SKIP: ${name}`); return; }
    report.checks.push({ name, passed: true, required }); console.log(`PASS: ${name}`);
  }
  catch (error) { report.checks.push({ name, passed: false, required, code: safeCode(error) }); console.log(`FAIL: ${name} (${safeCode(error)})`); }
}

async function account(label) {
  const email = `tf-security-${randomUUID()}@example.invalid`;
  const password = 'Tf!' + randomBytes(28).toString('base64url') + 'A7';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Fixture de segurança ${label}` } });
  ensure(!created.error && created.data.user, 'FIXTURE_CREATION_FAILED');
  const fixture = { id: created.data.user.id, client: createClient(url, key, options), token: null };
  fixtures.push(fixture);
  report.fixtureCounts.usersCreated++;
  const login = await fixture.client.auth.signInWithPassword({ email, password });
  ensure(!login.error && login.data.session, 'FIXTURE_LOGIN_FAILED');
  fixture.token = login.data.session.access_token;
  await fixture.client.realtime.setAuth(fixture.token);
  return fixture;
}

async function api(path, { actor, token = actor?.token, method = 'GET', body, expectedOwner, origin = site.origin, headers: extra = {} } = {}) {
  const destination = new URL(path, target);
  ensure(destination.origin === target.origin, 'NON_LOCAL_API_DESTINATION');
  const response = await fetch(destination, {
    method, redirect: 'manual', headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' ? { Origin: origin } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(expectedOwner !== undefined ? { 'X-TF-Account': expectedOwner } : {}), ...extra,
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => { throw new Error('API_RESPONSE_NOT_JSON'); });
  return { status: response.status, data, response };
}

async function join(client, owner, onMessage = () => {}) {
  const channel = client.channel(`tf:orders:${owner}`, { config: { private: true } }).on('broadcast', { event: 'orders_changed' }, onMessage);
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve({ channel, status: 'TIMEOUT' }), 15000);
    channel.subscribe(joinStatus => {
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(joinStatus)) { clearTimeout(timeout); resolve({ channel, status: joinStatus }); }
    });
  });
}

async function graphql(actor, query, variables = {}) {
  const response = await transport(new URL('/graphql/v1', url), { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  return { status: response.status, data: await response.json() };
}

try {
  await check('Anonymous and forged credentials cannot read private APIs', async () => {
    for (const path of ['/api/profile', '/api/orders', '/api/data']) {
      status(await api(path), 401);
      status(await api(path, { token: 'not-a-real-access-token' }), 401);
    }
  });
  first = await account('A');
  second = await account('B');
  await check('Verified accounts can read only their own profile', async () => {
    for (const actor of [first, second]) {
      const result = await api('/api/profile', { actor });
      status(result, 200);
      ensure(result.data.profile.id === actor.id, 'PROFILE_OWNER_MISMATCH');
      ensure(result.response.headers.get('cache-control')?.includes('no-store'), 'PRIVATE_RESPONSE_CAN_BE_CACHED');
    }
  });

  const delivery = { country: 'BR', region: 'SP-CAPITAL', postal: '', street: 'Endereço fictício da fixture', number: '', noNumber: true, complement: '', district: '', city: '', province: '', reference: '', instructions: '' };
  await check('Profile and saved-address mutation from A cannot change authenticated B', async () => {
    const before = await api('/api/profile', { actor: second });
    status(before, 200);
    const result = await api('/api/profile', { actor: second, expectedOwner: first.id, method: 'PATCH', body: { name: 'Nome da conta anterior', defaultDelivery: { delivery, method: 'standard' } } });
    status(result, 409);
    ensure(result.data.code === 'SESSION_CHANGED', 'WRONG_IDENTITY_ERROR');
    const after = await api('/api/profile', { actor: second });
    status(after, 200);
    ensure(JSON.stringify(before.data.profile) === JSON.stringify(after.data.profile), 'PROFILE_CHANGED_AFTER_IDENTITY_MISMATCH');
  });
  await check('Own profile and saved address can be updated without changing account ownership', async () => {
    const result = await api('/api/profile', { actor: first, expectedOwner: first.id, method: 'PATCH', body: { name: 'Fixture A atualizada', defaultDelivery: { delivery, method: 'standard' } } });
    status(result, 200);
    ensure(result.data.profile.id === first.id && result.data.profile.defaultDelivery?.delivery.street === delivery.street, 'SAVED_PROFILE_NOT_CONFIRMED');
  });
  await check('Cross-site and cookie writes without origin are refused', async () => {
    status(await api('/api/profile', { actor: first, expectedOwner: first.id, method: 'PATCH', origin: 'https://untrusted.example.invalid', body: { name: 'Must not change' } }), 403);
    status(await api('/api/profile', { actor: first, expectedOwner: first.id, method: 'PATCH', body: { name: 'Must not change' }, headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403);
    const response = await fetch(new URL('/api/profile', target), { method: 'PATCH', headers: { Cookie: 'sb-fixture-auth-token=not-a-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Must not change' }), signal: AbortSignal.timeout(25000) });
    ensure(response.status === 403, `HTTP_${response.status}_EXPECTED_403`);
  });
  await check('Client-selected owner, privilege and price fields are refused', async () => {
    for (const extra of [{ ownerId: second.id }, { user_id: second.id }, { role: 'admin' }, { totalInCents: 1 }]) {
      status(await api('/api/profile', { actor: first, expectedOwner: first.id, method: 'PATCH', body: { name: 'Fixture', ...extra } }), 400);
      status(await api('/api/checkout/quote', { method: 'POST', body: { items: [{ slug: 'original', quantity: 1 }], delivery, method: 'standard', ...extra } }), 400);
    }
  });
  await check('Realtime joins own topic and refuses the other account topic', async () => {
    const own = await join(first.client, first.id, message => notifications.push(message.payload));
    ensure(own.status === 'SUBSCRIBED', 'OWN_REALTIME_JOIN_DENIED');
    const foreign = await join(second.client, first.id);
    ensure(foreign.status !== 'SUBSCRIBED', 'FOREIGN_REALTIME_JOIN_ALLOWED');
    await second.client.removeChannel(foreign.channel);
  });
  await check('One real server-reviewed order is created for A', async () => {
    const input = { items: [{ slug: 'original', quantity: 1 }], delivery, method: 'standard' };
    const review = await api('/api/checkout/quote', { method: 'POST', body: input });
    status(review, 200);
    quote = review.data.quote;
    const result = await api('/api/orders', { actor: first, expectedOwner: first.id, method: 'POST', body: { ...input, reviewToken: quote.reviewToken } });
    status(result, 201);
    ensure(result.data.order.ownerId === first.id && result.data.order.id, 'ORDER_OWNER_MISMATCH');
    orderId = result.data.order.id;
    orderIds.push(orderId);
    report.fixtureCounts.ordersCreated++;
  });
  if (orderId) {
    await check('B cannot read or delete A order through HTTP', async () => {
      status(await api(`/api/orders/${orderId}`, { actor: second }), 404);
      status(await api(`/api/orders/${orderId}`, { actor: second, expectedOwner: second.id, method: 'DELETE' }), 404);
      const own = await api(`/api/orders/${orderId}`, { actor: first });
      status(own, 200);
      ensure(own.data.order.ownerId === first.id, 'OWN_ORDER_DISAPPEARED');
    });
    await check('Direct RLS hides A profile, order, items and events from B', async () => {
      for (const [table, column, id] of [['profiles', 'id', first.id], ['orders', 'id', orderId], ['order_items', 'order_id', orderId], ['order_events', 'order_id', orderId]]) {
        const result = await second.client.from(table).select('id').eq(column, id);
        ensure(!result.error && Array.isArray(result.data) && result.data.length === 0, 'FOREIGN_ROWS_VISIBLE_OR_RLS_QUERY_FAILED');
      }
    });
    await check('Browser roles cannot call privileged create/delete RPCs', async () => {
      const { reviewToken: _review, reviewExpiresAt: _expiry, ...draft } = quote;
      for (const actor of [first, second]) {
        const created = await actor.client.rpc('tf_create_order', { p_user_id: first.id, p_order: draft }).retry(false);
        ensure(created.error, 'PRIVILEGED_CREATE_RPC_ALLOWED');
        const removed = await actor.client.rpc('tf_delete_order', { p_user_id: first.id, p_order_id: orderId }).retry(false);
        ensure(removed.error, 'PRIVILEGED_DELETE_RPC_ALLOWED');
      }
      status(await api(`/api/orders/${orderId}`, { actor: first }), 200);
    });
    await check('GraphQL applies ownership to the same fixture order', async () => {
      const query = 'query FixtureOrder($id: UUID!) { ordersCollection(first: 1, filter: { id: { eq: $id } }) { edges { node { id } } } }';
      const own = await graphql(first, query, { id: orderId });
      if (own.data.errors || !own.data.data?.ordersCollection) {
        report.optional.push({ name: 'GraphQL ownership', status: 'unavailable', reason: 'Collection or GraphQL endpoint unavailable to this role' });
        return { skipped: 'GRAPHQL_UNAVAILABLE' };
      }
      ensure(own.status === 200 && own.data.data.ordersCollection.edges.length === 1, 'GRAPHQL_OWN_ORDER_MISSING');
      const foreign = await graphql(second, query, { id: orderId });
      ensure(foreign.status === 200 && !foreign.data.errors && foreign.data.data?.ordersCollection?.edges.length === 0, 'GRAPHQL_FOREIGN_ORDER_VISIBLE');
    });
    await check('Realtime invalidation exposes no order or address fields', async () => {
      for (let attempt = 0; attempt < 20 && !notifications.length; attempt++) await pause(150);
      ensure(notifications.length > 0, 'NO_REALTIME_INVALIDATION_RECEIVED');
      ensure(notifications.every(payload => payload && Object.keys(payload).every(field => field === 'id')), 'PRIVATE_CONTENT_IN_REALTIME_PAYLOAD');
    });
    await check('A can delete its own order and subsequent access is 404', async () => {
      status(await api(`/api/orders/${orderId}`, { actor: first, expectedOwner: first.id, method: 'DELETE' }), 204);
      status(await api(`/api/orders/${orderId}`, { actor: first }), 404);
      status(await api(`/api/orders/${orderId}`, { actor: first, expectedOwner: first.id, method: 'DELETE' }), 404);
    });
  } else report.optional.push({ name: 'Order-dependent checks', status: 'blocked', reason: 'Fixture order was not created' });
} catch (error) {
  report.checks.push({ name: 'Fixture setup or execution', passed: false, required: true, code: safeCode(error) });
  console.log(`FAIL: setup or execution (${safeCode(error)})`);
} finally {
  const cleanup = { sessionsRevoked: true, usersDeleted: true, userAbsenceVerified: true, profilesRemaining: null, ordersRemaining: null, itemsRemaining: null, eventsRemaining: null };
  for (const actor of fixtures) {
    try { await actor.client.removeAllChannels(); } catch { /* Revocation/deletion still proceeds. */ }
    if (actor.token) {
      try { const revoked = await admin.auth.admin.signOut(actor.token, 'global'); if (revoked.error && ![401, 403, 404].includes(revoked.error.status)) cleanup.sessionsRevoked = false; } catch { cleanup.sessionsRevoked = false; }
      try { await actor.client.auth.signOut({ scope: 'local' }); } catch { /* Admin revocation above is authoritative. */ }
    }
    try { const deleted = await admin.auth.admin.deleteUser(actor.id); if (deleted.error) cleanup.usersDeleted = false; } catch { cleanup.usersDeleted = false; }
    try { const absent = await admin.auth.admin.getUserById(actor.id); if (absent.data.user || !absent.error || ![404, 422].includes(absent.error.status)) cleanup.userAbsenceVerified = false; } catch { cleanup.userAbsenceVerified = false; }
  }
  const ids = fixtures.map(actor => actor.id);
  if (ids.length) for (const [label, table, column, values] of [
    ['profilesRemaining', 'profiles', 'id', ids], ['ordersRemaining', 'orders', 'user_id', ids],
    ['itemsRemaining', 'order_items', 'order_id', orderIds], ['eventsRemaining', 'order_events', 'order_id', orderIds],
  ]) {
    if (!values.length) { cleanup[label] = 0; continue; }
    try { const remaining = await admin.from(table).select('id', { count: 'exact', head: true }).in(column, values); cleanup[label] = remaining.error ? null : remaining.count; } catch { cleanup[label] = null; }
  }
  try { await admin.removeAllChannels(); } catch { /* No channels are retained by this admin client. */ }
  report.cleanup = cleanup;
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.every(check => !check.required || check.passed) && cleanup.sessionsRevoked && cleanup.usersDeleted && cleanup.userAbsenceVerified && ['profilesRemaining', 'ordersRemaining', 'itemsRemaining', 'eventsRemaining'].every(field => cleanup[field] === 0);
  await mkdir('test-results/security', { recursive: true });
  await writeFile('test-results/security/live-api-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, groupsPassed: report.checks.filter(check => check.passed).length, groupsTotal: report.checks.length, fixtureCounts: report.fixtureCounts, cleanup }));
  if (!report.passed) process.exitCode = 1;
}
