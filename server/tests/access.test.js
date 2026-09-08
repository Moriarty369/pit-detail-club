import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../store.js';
import { createApp } from '../http.js';
import { hashPassword, digest, rateLimit } from '../security.js';
import { balance } from '../../src/domain.js';
const password = 'Test-password-for-PIT-2026';
const origin = 'https://club.example.test', adminOrigin = 'https://admin.example.test';
let store, customerServer, adminServer, customerUrl, adminUrl, admin, customer, other, customerCookie, adminCookie;
const temp = mkdtempSync(join(tmpdir(), 'pit-api-test-'));
async function call(scope, path, { method = 'GET', data, cookie, origin: requestOrigin, headers = {} } = {}) {
  const res = await fetch((scope === 'customer' ? customerUrl : adminUrl) + '/api' + path, {
    method, headers: { Origin: requestOrigin ?? (scope === 'customer' ? origin : adminOrigin), 'X-PIT-Client': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie'), headers: res.headers };
}
before(async () => {
  store = openStore(join(temp, 'test.sqlite'));
  const passwordHash = await hashPassword(password);
  admin = store.addUser({ email: 'admin@example.test', name: 'Admin de pruebas', role: 'admin', passwordHash });
  other = store.addUser({ email: 'other@example.test', name: 'Otro cliente', passwordHash });
  customerServer = createApp({ store, scope: 'customer', origins: [origin] });
  adminServer = createApp({ store, scope: 'admin', origins: [adminOrigin] });
  customerServer.listen(0, '127.0.0.1'); await once(customerServer, 'listening');
  adminServer.listen(0, '127.0.0.1'); await once(adminServer, 'listening');
  customerUrl = `http://127.0.0.1:${customerServer.address().port}`;
  adminUrl = `http://127.0.0.1:${adminServer.address().port}`;
});
after(async () => {
  await Promise.all([new Promise(r => customerServer.close(r)), new Promise(r => adminServer.close(r))]);
  store.close(); rmSync(temp, { recursive: true, force: true });
});
test('registro público no permite elegir rol, saldo ni primer servicio', async () => {
  for (const extra of [{ role: 'admin' }, { points: 250000 }, { firstService: { cents: 25000 } }]) {
    assert.equal((await call('customer', '/auth/register', { method: 'POST', data: { name: 'Cliente', email: 'customer@example.test', password, ...extra } })).status, 400);
  }
  const result = await call('customer', '/auth/register', { method: 'POST', data: { name: 'Cliente', email: 'customer@example.test', password } });
  assert.equal(result.status, 201); customer = result.body.user;
  assert.equal(customer.role, 'customer'); assert.equal(balance(result.body.member), 0);
  assert.match(result.cookie, /HttpOnly; SameSite=Strict; Path=\/api; Max-Age=7200; Secure/);
  customerCookie = result.cookie.split(';')[0];
  const session = store.db.prepare('SELECT * FROM sessions WHERE user_id = ?').get(customer.id);
  assert.equal(session.token_hash, digest(customerCookie.split('=')[1]));
  assert.equal(JSON.stringify(result.body).includes('password_hash'), false);
});
test('sesiones y roles se comprueban en cada portal, incluso con cookies falsificadas', async () => {
  assert.equal((await call('admin', '/customers')).status, 401);
  assert.equal((await call('customer', '/me')).status, 401);
  assert.equal((await call('admin', '/auth/register', { method: 'POST', data: {} })).status, 404);
  assert.equal((await call('admin', '/auth/login', { method: 'POST', data: { email: customer.email, password } })).status, 401);
  assert.equal((await call('customer', '/auth/login', { method: 'POST', data: { email: admin.email, password } })).status, 401);
  assert.equal((await call('admin', '/customers', { cookie: customerCookie.replace('pit_customer_', 'pit_admin_') })).status, 401);
  const login = await call('admin', '/auth/login', { method: 'POST', data: { email: admin.email, password } });
  assert.equal(login.status, 200); adminCookie = login.cookie.split(';')[0];
  assert.equal((await call('customer', '/me', { cookie: adminCookie.replace('pit_admin_', 'pit_customer_') })).status, 401);
});
test('cliente solo consulta y modifica su perfil; no existen rutas de negocio en su API', async () => {
  assert.equal((await call('customer', '/me', { cookie: customerCookie })).body.customer.id, customer.id);
  for (const path of ['/customers', `/customers/${other.id}`, '/rules', '/audit']) assert.equal((await call('customer', path, { cookie: customerCookie })).status, 404);
  for (const extra of [{ role: 'admin' }, { entries: [] }, { rules: {} }, { id: other.id }]) {
    assert.equal((await call('customer', '/me', { method: 'PATCH', cookie: customerCookie, data: { name: 'Cliente Editado', vehicle: 'Moto', marketing: false, ...extra } })).status, 400);
  }
  assert.equal((await call('customer', `/customers/${customer.id}/services`, { method: 'POST', cookie: customerCookie, data: {} })).status, 404);
  assert.equal((await call('customer', '/me', { method: 'PATCH', cookie: customerCookie, data: { name: 'Cliente Editado', vehicle: 'Moto', marketing: false } })).status, 200);
  assert.equal(store.member(other.id).customer.name, 'Otro cliente');
});
test('CSRF: se rechazan orígenes ajenos, solicitudes sin cabecera y origen del otro portal', async () => {
  for (const requestOrigin of ['https://attacker.test', '', adminOrigin]) {
    assert.equal((await call('customer', '/auth/logout', { method: 'POST', cookie: customerCookie, origin: requestOrigin, data: {} })).status, 403);
  }
  assert.equal((await call('customer', '/auth/logout', { method: 'POST', cookie: customerCookie, data: {}, headers: { 'X-PIT-Client': '' } })).status, 403);
  assert.equal((await call('customer', '/me', { cookie: customerCookie })).status, 200);
});
test('solo admin registra $5–$250 a 1000 puntos/$, sin duplicar una operación reenviada', async () => {
  const path = `/customers/${customer.id}/services`, data = { id: 'service-moto', service: 'Lavado de moto', cents: 500, mode: 'En local' };
  for (const cents of [499, 25001, 500.5]) assert.equal((await call('admin', path, { method: 'POST', cookie: adminCookie, data: { ...data, cents } })).status, 400);
  assert.equal((await call('admin', path, { method: 'POST', cookie: adminCookie, data: { ...data, points: 999999 } })).status, 400);
  const results = await Promise.all([1, 2].map(() => call('admin', path, { method: 'POST', cookie: adminCookie, data })));
  for (const result of results) { assert.equal(result.status, 200); assert.equal(balance(result.body), 5000); assert.equal(result.body.entries.length, 1); }
  assert.equal((await call('admin', path, { method: 'POST', cookie: adminCookie, data: { ...data, cents: 600 } })).status, 409);
  const full = await call('admin', path, { method: 'POST', cookie: adminCookie, data: { ...data, id: 'service-full', service: 'Detailing integral', cents: 25000 } });
  assert.equal(full.status, 200); assert.equal(balance(full.body), 255000);
  assert.equal((await call('admin', '/customers/no-such-customer/services', { method: 'POST', cookie: adminCookie, data })).status, 404);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM audit WHERE action = 'service.create'").get().n, 2);
});
test('cliente solicita; admin confirma canje una sola vez; las reglas globales respetan códigos activos', async () => {
  const reward = await call('customer', '/me/rewards', { method: 'POST', cookie: customerCookie, data: { offerId: 'oil' } });
  assert.equal(reward.status, 200); assert.equal(balance(reward.body.state), 255000);
  const repeated = await call('customer', '/me/rewards', { method: 'POST', cookie: customerCookie, data: { offerId: 'oil' } });
  assert.equal(repeated.body.reward.code, reward.body.reward.code);
  assert.equal((await call('admin', '/rules', { method: 'PATCH', cookie: adminCookie, data: { thresholdCents: 20000, rappelPercent: 7 } })).status, 422);
  const path = `/customers/${customer.id}/redemptions`, data = { code: reward.body.reward.code, conditionsConfirmed: true };
  assert.equal((await call('customer', path, { method: 'POST', cookie: customerCookie, data })).status, 404);
  assert.equal((await call('admin', path, { method: 'POST', cookie: adminCookie, data: { ...data, conditionsConfirmed: false } })).status, 400);
  const results = await Promise.all([1, 2].map(() => call('admin', path, { method: 'POST', cookie: adminCookie, data })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 422]);
  assert.equal(balance(store.member(customer.id)), 155000);
  assert.equal((await call('admin', '/rules', { method: 'PATCH', cookie: adminCookie, data: { thresholdCents: 20000, rappelPercent: 7 } })).status, 200);
  assert.equal((await call('customer', '/me', { cookie: customerCookie })).body.rules.rappelPercent, 7);
  assert.equal(store.member(other.id).rules.rappelPercent, 7);
  const audit = (await call('admin', '/audit', { cookie: adminCookie })).body;
  assert.equal(audit.filter(e => e.action === 'reward.redeem').length, 1);
  assert.equal(audit.find(e => e.action === 'service.create').actor_id, admin.id);
});
test('persistencia SQLite y errores internos sin detalles privados', async () => {
  const second = openStore(join(temp, 'test.sqlite'));
  assert.equal(balance(second.member(customer.id)), 155000); second.close();
  const member = store.member; store.member = () => { throw new Error('PRIVATE database filename'); };
  try { const result = await call('customer', '/me', { cookie: customerCookie }); assert.equal(result.status, 500); assert.deepEqual(result.body, { error: 'Error interno.' }); }
  finally { store.member = member; }
});
test('logout revoca, la caducidad se impone en servidor y el límite de intentos expira', async () => {
  assert.equal((await call('customer', '/auth/logout', { method: 'POST', cookie: customerCookie, data: {} })).status, 200);
  assert.equal((await call('customer', '/me', { cookie: customerCookie })).status, 401);
  store.db.prepare('UPDATE sessions SET expires_at = 0 WHERE user_id = ?').run(admin.id);
  assert.equal((await call('admin', '/customers', { cookie: adminCookie })).status, 401);
  rateLimit(store, 'test-limit', 1, 1000); assert.throws(() => rateLimit(store, 'test-limit', 1, 2000), e => e.status === 429);
  assert.doesNotThrow(() => rateLimit(store, 'test-limit', 1, 901000));
});
