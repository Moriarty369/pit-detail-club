import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoAuth } from '../src/demo-auth.js';

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
  assert.equal(member.entries[0].points, 650);
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
