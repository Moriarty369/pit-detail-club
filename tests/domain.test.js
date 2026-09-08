import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, balance, quarter, quarterSpend, addService, requestReward, redeem, updateRules } from '../src/domain.js';
const now = new Date('2026-09-08T12:00:00Z');
test('un servicio suma puntos enteros y una petición repetida no los duplica', () => {
  const initial = createState(now), input = { id: 'sale-1', service: 'Cambio de aceite', cents: 2599, mode: 'A domicilio' };
  const updated = addService(initial, input, now);
  assert.equal(balance(updated), balance(initial) + 259);
  assert.equal(quarterSpend(updated, now), 15099);
  assert.deepEqual(addService(updated, input, now), updated);
  assert.equal(initial.entries.length, 3);
});
test('rechaza importes negativos, fraccionarios, infinitos y servicios desconocidos', () => {
  for (const cents of [-1, 0, NaN, Infinity, 10.5, 1000001]) assert.throws(() => addService(createState(now), { id: 'x', service: 'Cambio de aceite', cents, mode: 'En local' }, now));
  assert.throws(() => addService(createState(now), { id: 'x', service: 'Otro', cents: 100, mode: 'En local' }, now));
});
test('solicitar reutiliza el código activo y no resta puntos hasta validar; el doble canje falla', () => {
  const initial = createState(now), first = requestReward(initial, 'oil', now);
  assert.equal(balance(first.state), 1250);
  assert.equal(requestReward(first.state, 'oil', now).reward.code, first.reward.code);
  const used = redeem(first.state, first.reward.code.toLowerCase(), now);
  assert.equal(balance(used), 250);
  assert.throws(() => redeem(used, first.reward.code, now), /ya fue utilizado/);
});
test('saldo insuficiente, código inexistente y expiración impiden el canje', () => {
  const initial = createState(now);
  assert.throws(() => requestReward(initial, 'wash', now), /no está disponible/);
  assert.throws(() => redeem(initial, 'inexistente', now), /No encontramos/);
  const result = requestReward(initial, 'oil', now);
  assert.throws(() => redeem(result.state, result.reward.code, new Date(now.getTime() + 300000)), /caducado/);
  const second = requestReward(result.state, 'oil', new Date(now.getTime() + 300001));
  assert.notEqual(second.reward.code, result.reward.code);
});
test('revalida el saldo al consumir dos códigos distintos', () => {
  let state = addService(createState(now), { id: 'extra', service: 'Detailing integral', cents: 2500, mode: 'En local' }, now);
  const wash = requestReward(state, 'wash', now);
  const oil = requestReward(wash.state, 'oil', now);
  state = redeem(oil.state, wash.reward.code, now);
  assert.equal(balance(state), 0);
  assert.throws(() => redeem(state, oil.reward.code, now), /condiciones/);
});
test('rappel exige umbral, solo se usa una vez por trimestre y no consume puntos', () => {
  const initial = createState(now);
  assert.throws(() => requestReward(initial, 'rappel', now));
  const funded = addService(initial, { id: 'extra', service: 'Detailing integral', cents: 12500, mode: 'En local' }, now);
  const result = requestReward(funded, 'rappel', now);
  const used = redeem(result.state, result.reward.code, now);
  assert.equal(balance(used), balance(funded));
  assert.throws(() => requestReward(used, 'rappel', now));
  assert.equal(quarterSpend(used, new Date('2026-10-02T12:00:00Z')), 0);
});
test('el trimestre se calcula con hora de Venezuela', () => {
  assert.equal(quarter(new Date('2026-10-01T02:00:00Z')), '2026-T3');
  assert.equal(quarter(new Date('2026-10-01T04:00:00Z')), '2026-T4');
});
test('las nuevas reglas no recalculan puntos históricos y rechazan porcentajes inválidos', () => {
  const initial = createState(now);
  const updated = updateRules(initial, { pointsPerDollar: 20, thresholdCents: 30000, rappelPercent: 8 });
  assert.equal(balance(updated), 1250);
  assert.equal(balance(addService(updated, { id: 'x', service: 'Cambio de aceite', cents: 1000, mode: 'En local' }, now)), 1450);
  assert.throws(() => updateRules(initial, { pointsPerDollar: 10, thresholdCents: 25000, rappelPercent: 101 }));
});
