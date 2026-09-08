import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
let activeHashes = 0;
async function passwordKey(password, salt) {
  if (activeHashes >= 2) throw new HttpError(503, 'El acceso está ocupado. Vuelve a intentarlo en unos segundos.');
  activeHashes++;
  try { return await derive(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }); }
  finally { activeHashes--; }
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function onlyFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new HttpError(400, 'La solicitud contiene campos no permitidos.');
}
export function textField(value, min, max, label) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new HttpError(400, `Revisa ${label}.`);
  return value.trim();
}
export function emailField(value) {
  const email = textField(value, 3, 120, 'el correo').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Escribe un correo válido.');
  return email;
}
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new HttpError(400, 'La contraseña debe tener entre 12 y 128 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const hash = await passwordKey(password, salt);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [, salt, expected] = encoded.split('$');
  const hash = await passwordKey(password, salt);
  return timingSafeEqual(hash, Buffer.from(expected, 'hex'));
}
export function rateLimit(store, key, limit, now = Date.now()) {
  store.transaction(() => {
    store.db.prepare('DELETE FROM attempts WHERE expires_at <= ?').run(now);
    const id = digest(key), previous = store.db.prepare('SELECT * FROM attempts WHERE key = ?').get(id);
    if (previous && previous.count >= limit) throw new HttpError(429, 'Demasiados intentos. Vuelve a probar en 15 minutos.');
    store.db.prepare('INSERT INTO attempts VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1').run(id, now + 900000);
  });
}
export function cookieName(scope) { return `pit_${scope}_session`; }
export function readSession(req, store, scope, now = Date.now()) {
  const pair = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName(scope)}=`));
  const token = pair?.slice(pair.indexOf('=') + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return store.db.prepare(`SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.scope = ? AND s.expires_at > ? AND u.role = ?`).get(digest(token), scope, now, scope) || null;
}
export function sessionCookie(token, scope, secure, maxAge = 7200) {
  return `${cookieName(scope)}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
export function startSession(store, user, scope, secure) {
  const token = randomBytes(32).toString('hex');
  store.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  store.db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(digest(token), user.id, scope, Date.now() + 7200000);
  return sessionCookie(token, scope, secure);
}
export function endSession(req, store, scope) {
  const pair = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName(scope)}=`));
  if (pair) store.db.prepare('DELETE FROM sessions WHERE token_hash = ? AND scope = ?').run(digest(pair.slice(pair.indexOf('=') + 1)), scope);
}
