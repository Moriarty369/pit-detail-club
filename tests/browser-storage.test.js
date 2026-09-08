import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserStorage } from '../src/browser-storage.js';

const memory = () => {
  const values = new Map([['existing-account', 'keep']]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
test('usa el almacenamiento disponible sin borrar cuentas previas', () => {
  const host = { localStorage: memory(), sessionStorage: memory() };
  const result = createBrowserStorage(host);
  assert.equal(result.temporary, false);
  assert.equal(result.storage, host.localStorage);
  assert.equal(result.session, host.sessionStorage);
  assert.equal(result.storage.getItem('existing-account'), 'keep');
});
test('si se bloquea el acceso o la escritura, toda la demo usa memoria aislada', () => {
  for (const key of ['localStorage', 'sessionStorage']) {
    for (const block of ['read', 'write']) {
      const host = { localStorage: memory(), sessionStorage: memory() };
      if (block === 'read') Object.defineProperty(host, key, { get() { throw new Error('blocked'); } });
      else host[key].setItem = () => { throw new Error('quota'); };
      const result = createBrowserStorage(host);
      assert.equal(result.temporary, true);
      result.storage.setItem('account', 'demo');
      assert.equal(result.storage.getItem('account'), 'demo');
      assert.equal(result.session.getItem('account'), null);
      assert.equal(createBrowserStorage(host).storage.getItem('account'), null);
      result.storage.removeItem('account');
      assert.equal(result.storage.getItem('account'), null);
    }
  }
});
