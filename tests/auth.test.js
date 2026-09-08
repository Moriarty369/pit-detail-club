import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoAuth, ACCOUNT_KEY, SESSION_KEY } from '../src/demo-auth.js';

function setup() {
  const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
  let clock = Date.parse('2026-09-08T12:00:00Z');
  const storage = memory(), session = memory();
  return { auth: createDemoAuth({ storage, session, now: () => clock }), advance: ms => { clock += ms; }, storage, session };
}
test('no session until the code is confirmed; repeat login never duplicates the first service', () => {
  const { auth } = setup();
  assert.equal(auth.current(), null);
  const challenge = auth.request({ mode: 'login', email: ' Alex@Example.com ' });
  assert.equal(auth.current(), null);
  assert.throws(() => auth.confirm(challenge.code === '000000' ? '111111' : '000000'), /no coincide/);
  const member = auth.confirm(challenge.code);
  assert.equal(member.entries.length, 1);
  assert.equal(member.entries[0].points, 65000);
  assert.equal(member.customer.email, 'alex@example.com');
  assert.throws(() => auth.confirm(challenge.code), /caducado/);
  auth.logout();
  assert.equal(auth.current(), null);
  const next = auth.request({ mode: 'login', email: 'alex@example.com' });
  assert.equal(auth.confirm(next.code).entries.length, 1);
});
test('registration requires confirmation, rejects duplicates and isolates demo accounts', () => {
  const { auth } = setup();
  const a = auth.request({ mode: 'register', email: 'a@example.com', name: 'Andrea' });
  const member = auth.confirm(a.code);
  auth.save({ ...member, customer: { ...member.customer, vehicle: 'Toyota' } });
  auth.logout();
  assert.throws(() => auth.request({ mode: 'register', email: 'a@example.com', name: 'Otra' }), /ya existe/);
  assert.throws(() => auth.request({ mode: 'login', email: 'unknown@example.com' }), /No hay una cuenta/);
  const b = auth.request({ mode: 'register', email: 'b@example.com', name: 'Bruno' });
  const other = auth.confirm(b.code);
  assert.notEqual(member.customer.id, other.customer.id);
  assert.equal(other.customer.vehicle, '');
  assert.throws(() => auth.save(member), /sesión/);
  auth.logout();
  const back = auth.request({ mode: 'login', email: 'a@example.com' });
  assert.equal(auth.confirm(back.code).customer.vehicle, 'Toyota');
});
test('expiry and five wrong attempts invalidate codes; a session expires after two hours', () => {
  const { auth, advance } = setup();
  const expired = auth.request({ mode: 'login', email: 'alex@example.com' });
  advance(300001);
  assert.throws(() => auth.confirm(expired.code), /caducado/);
  const attempt = auth.request({ mode: 'login', email: 'alex@example.com' });
  for (let i = 0; i < 5; i++) assert.throws(() => auth.confirm(attempt.code === '000000' ? '111111' : '000000'));
  assert.throws(() => auth.confirm(attempt.code), /caducado/);
  const good = auth.request({ mode: 'login', email: 'alex@example.com' });
  auth.confirm(good.code);
  advance(7200000);
  assert.equal(auth.current(), null);
});

test('el registro conserva el primer servicio elegido al volver a iniciar sesión', () => {
  const { auth } = setup();
  for (const [email, service, cents] of [['moto@example.com', 'Lavado de moto', 500], ['full@example.com', 'Detailing integral', 25000]]) {
    const challenge = auth.request({ mode: 'register', name: 'Demo', email, firstService: { service, cents } });
    const member = auth.confirm(challenge.code);
    assert.equal(member.entries[0].points, cents * 10);
    assert.equal(member.entries[0].service, service);
    auth.logout();
    const login = auth.request({ mode: 'login', email });
    assert.deepEqual(auth.confirm(login.code).entries, member.entries);
    auth.logout();
  }
});
test('una sesión anterior actualiza y persiste todas las cuentas una sola vez', () => {
  const { auth, storage, session } = setup();
  const challenge = auth.request({ mode: 'login', email: 'alex@example.com' });
  const member = auth.confirm(challenge.code);
  member.version = 1;
  member.rules.pointsPerDollar = 10;
  member.entries[0].points = 650;
  storage.setItem(ACCOUNT_KEY, JSON.stringify([member]));
  const active = session.getItem(SESSION_KEY);
  assert.equal(auth.current().entries[0].points, 65000);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_KEY))[0].version, 2);
  assert.equal(auth.current().entries[0].points, 65000);
  assert.equal(auth.current().entries.length, 1);
  assert.equal(session.getItem(SESSION_KEY), active);
});
