/** Explicit local integration check. Temporary Auth fixtures use no SMTP and are deleted in finally. */
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes('--allow-test-users')) throw new Error('Pass --allow-test-users to create and remove isolated integration fixtures.');
const site = new URL(process.env.NEXT_PUBLIC_SITE_URL);
assert(['127.0.0.1', 'localhost'].includes(site.hostname), 'Integration API target must be local.');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && key && secret, 'Configure Supabase environment before running.');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { retry: false } };
const admin = createClient(url, secret, options);
const clients = [];
const fixtureIds = [];
const passed = [];
const report = (message) => { passed.push(message); console.log('PASS: ' + message); };
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function account() {
  const email = `tf-check-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Conta temporária de verificação' } });
  if (error) throw new Error(`Temporary Auth fixture creation failed (${error.status ?? 'unknown'}).`);
  fixtureIds.push(data.user.id);
  const client = createClient(url, key, options);
  clients.push(client);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) throw new Error('Temporary Auth login failed.');
  const token = login.data.session.access_token;
  await client.realtime.setAuth(token);
  return { id: data.user.id, client, token };
}

async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(new URL(path, site), {
    method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' ? { Origin: site.origin } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data, response };
}

function subscribe(client, topic, onMessage = () => {}) {
  const channel = client.channel(topic, { config: { private: true } }).on('broadcast', { event: 'orders_changed' }, onMessage);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime join timeout.')), 18000);
    channel.subscribe((status, error) => {
      if (['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(status)) { clearTimeout(timeout); resolve({ channel, status, reason: error?.message }); }
    });
  });
}

try {
  for (const locale of ['pt-BR','en','es','zh-Hans']) {
    const result = await api(`/api/products?locale=${locale}`);
    assert.equal(result.status, 200);
    assert.equal(result.data.products.length, 4);
  }
  report('database catalogue available in four languages');
  assert.equal((await api('/api/orders')).status, 401);
  report('private API rejects missing session');
  const first = await account();
  const second = await account();
  const profile = await api('/api/profile', { token: first.token });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.profile.id, first.id);
  const updated = await api('/api/profile', { token: first.token, method: 'PATCH', body: { name: 'Nome temporário atualizado' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.profile.name, 'Nome temporário atualizado');
  report('real Auth identity and own-profile read/update');

  const notifications = [];
  const own = await subscribe(first.client, `tf:orders:${first.id}`, message => notifications.push(message.payload));
  assert.equal(own.status, 'SUBSCRIBED', own.reason);
  const denied = await subscribe(second.client, `tf:orders:${first.id}`);
  assert.notEqual(denied.status, 'SUBSCRIBED');
  await second.client.removeChannel(denied.channel);
  report('Realtime accepts own private topic and rejects another account');

  const input = { items: [{ slug: 'original', quantity: 6 }], delivery: { country: 'BR', region: 'SP-CAPITAL', street: 'Endereço fictício de teste' }, method: 'standard' };
  const quote = await api('/api/checkout/quote', { method: 'POST', body: input });
  assert.equal(quote.status, 200);
  assert.equal(quote.data.quote.totalInCents, 7707);
  const body = { ...input, reviewToken: quote.data.quote.reviewToken };
  const attempts = await Promise.all(Array.from({ length: 10 }, () => api('/api/orders', { token: first.token, method: 'POST', body })));
  const accepted = attempts.filter(result => result.status === 201);
  const refused = attempts.filter(result => result.status === 409 && result.data.code === 'ORDER_LIMIT_REACHED');
  assert.equal(accepted.length, 5, `Expected five accepted orders, got ${accepted.length}; statuses: ${attempts.map(r => r.status).join(',')}`);
  assert.equal(refused.length, 5);
  assert.equal(new Set(accepted.map(result => result.data.order.id)).size, 5);
  assert.equal((await api('/api/orders', { token: first.token })).data.orders.length, 5);
  report('10 simultaneous purchases: five distinct orders and five refusals');

  const id = accepted[0].data.order.id;
  assert.equal((await api(`/api/orders/${id}`, { token: second.token })).status, 404);
  assert.equal((await api(`/api/orders/${id}`, { token: second.token, method: 'DELETE' })).status, 404);
  const foreignRows = await second.client.from('orders').select('id');
  assert.equal(foreignRows.error, null);
  assert.equal(foreignRows.data.length, 0);
  report('API and direct database reads prevent cross-account order access');

  assert.equal((await api(`/api/orders/${id}`, { token: first.token, method: 'DELETE' })).status, 204);
  assert.equal((await api(`/api/orders/${id}`, { token: first.token, method: 'DELETE' })).status, 404);
  assert.equal((await api('/api/orders', { token: first.token, method: 'POST', body })).status, 201);
  report('physical deletion releases exactly one slot; equal orders remain allowed');
  for (let i = 0; i < 20 && !notifications.length; i++) await pause(200);
  assert(notifications.length > 0, 'Expected an actual WebSocket invalidation.');
  assert(notifications.every(payload => payload && Object.keys(payload).every(field => field === 'id')), 'Broadcast must contain no order or address data.');
  report('actual private WebSocket notifications contain no order data');

  const limiterKey = randomBytes(32).toString('hex');
  const rates = await Promise.all(Array.from({ length: 6 }, () => admin.rpc('tf_rate_limit', { p_key: limiterKey, p_limit: 3, p_window_seconds: 60 }).retry(false)));
  assert(rates.every(result => !result.error));
  assert.equal(rates.filter(result => result.data.allowed).length, 3);
  assert.equal(rates.filter(result => !result.data.allowed).length, 3);
  report('shared database rate limit remains atomic under simultaneous calls');
  console.log(`Completed ${passed.length} integration groups. No SMTP message was sent.`);
} finally {
  await Promise.all(clients.map(async client => { await client.removeAllChannels(); await client.auth.signOut({ scope: 'local' }); }));
  for (const id of fixtureIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) { console.error('Temporary fixture cleanup failed; inspect integration fixtures.'); process.exitCode = 1; }
  }
  await admin.removeAllChannels();
  console.log('Temporary account and order cleanup requested.');
}
