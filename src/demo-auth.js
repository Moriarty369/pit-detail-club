import { createMemberState, migrateState } from './domain.js';

// UI demonstration only: this adapter does not establish a verified identity.
// It must be replaced by server-backed authentication before handling real data.
export const ACCOUNT_KEY = 'pit-detail-demo-accounts-v1';
export const SESSION_KEY = 'pit-detail-demo-session-v1';
export function createDemoAuth({ storage, session, now = () => Date.now() }) {
  let pending = null;
  const normalize = email => String(email || '').trim().toLowerCase();
  function accounts() {
    const value = JSON.parse(storage.getItem(ACCOUNT_KEY) || '[]');
    if (!Array.isArray(value)) throw new Error('No se pudieron leer las cuentas de prueba de este navegador.');
    const upgraded = value.map(migrateState);
    if (upgraded.some((member, index) => member !== value[index])) storage.setItem(ACCOUNT_KEY, JSON.stringify(upgraded));
    return upgraded;
  }
  function current() {
    try {
      const active = JSON.parse(session.getItem(SESSION_KEY) || 'null');
      if (!active || active.expiresAt <= now()) return null;
      return accounts().find(value => value.customer.id === active.id) || null;
    } catch { return null; }
  }
  function request({ mode, email, name, marketing = false, firstService }) {
    pending = null;
    email = normalize(email);
    if (!['login', 'register'].includes(mode) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Error('Escribe un correo de prueba válido.');
    const saved = accounts();
    let member = saved.find(value => value.customer.email === email);
    if (mode === 'register') {
      name = String(name || '').trim();
      if (name.length < 2 || name.length > 70) throw new Error('Escribe un nombre de entre 2 y 70 caracteres.');
      if (member || email === 'alex@example.com') throw new Error('Esa cuenta de prueba ya existe. Elige «Iniciar sesión».');
      member = createMemberState({ name, email, marketing }, new Date(now()), firstService);
    } else if (!member && email === 'alex@example.com') {
      member = createMemberState({ id: 'PIT-0001', name: 'Alex Mendoza', email, marketing: false, vehicle: 'Toyota Corolla · 2020' }, new Date(now()));
    } else if (!member) {
      throw new Error('No hay una cuenta de prueba con ese correo en este navegador. Regístrate primero o usa alex@example.com.');
    }
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    pending = { mode, member, code, attempts: 0, expiresAt: now() + 300000 };
    return { code, email, mode };
  }
  function confirm(code) {
    if (!pending || pending.expiresAt <= now()) { pending = null; throw new Error('El código de prueba ha caducado. Vuelve a empezar.'); }
    pending.attempts++;
    if (String(code).trim() !== pending.code) {
      if (pending.attempts >= 5) { pending = null; throw new Error('Demasiados intentos. Vuelve a empezar.'); }
      throw new Error('El código no coincide con el código de prueba mostrado.');
    }
    const saved = accounts();
    const existing = saved.find(value => value.customer.email === pending.member.customer.email);
    if (pending.mode === 'register' && existing) { pending = null; throw new Error('Esta cuenta ya se ha creado. Inicia sesión.'); }
    const member = existing || pending.member;
    if (!existing) storage.setItem(ACCOUNT_KEY, JSON.stringify([...saved, member]));
    session.setItem(SESSION_KEY, JSON.stringify({ id: member.customer.id, expiresAt: now() + 7200000 }));
    pending = null;
    return member;
  }
  function save(member) {
    const active = current();
    if (!active || active.customer.id !== member.customer.id) throw new Error('La sesión ha terminado. Inicia sesión de nuevo.');
    if (member.customer.email !== active.customer.email) throw new Error('El correo de acceso no se puede cambiar en esta beta.');
    storage.setItem(ACCOUNT_KEY, JSON.stringify(accounts().map(value => value.customer.id === member.customer.id ? member : value)));
  }
  function logout() { pending = null; session.removeItem(SESSION_KEY); }
  return { request, confirm, current, save, logout };
}
