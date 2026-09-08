import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { balance, addService, requestReward, redeem, updateRules } from '../src/domain.js';
import { HttpError, onlyFields, textField, emailField, hashPassword, verifyPassword, rateLimit, readSession, startSession, endSession, sessionCookie } from './security.js';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain' };
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
async function bodyOf(req) {
  let data = '', size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new HttpError(413, 'Solicitud demasiado grande.'); data += chunk; }
  try { return JSON.parse(data || '{}'); } catch { throw new HttpError(400, 'JSON no válido.'); }
}
const safeUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role });
function business(work) { try { return work(); } catch (error) { throw new HttpError(422, error.message); } }
function getMember(store, id) { const state = store.member(id); if (!state) throw new HttpError(404, 'Cliente no encontrado.'); return state; }

export function createApp({ store, scope, origins, staticDir, secureCookies = true }) {
  if (!['customer', 'admin'].includes(scope) || !origins?.length) throw new Error('Configura la aplicación y sus orígenes.');
  const allowed = new Set(origins);
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname, method = req.method;
      if (!path.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(method) || !staticDir) throw new HttpError(404, 'Ruta no encontrada.');
        const relative = decodeURIComponent(path === '/' ? '/index.html' : path);
        const filename = resolve(staticDir, `.${relative}`);
        if (!filename.startsWith(resolve(staticDir) + sep) || relative.split('/').some(part => part.startsWith('.')) || !mime[extname(filename)]) throw new HttpError(404, 'Ruta no encontrada.');
        let data; try { data = await readFile(filename); } catch { throw new HttpError(404, 'Ruta no encontrada.'); }
        res.setHeader('Content-Type', mime[extname(filename)]);
        res.end(method === 'HEAD' ? undefined : data); return;
      }
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin)) throw new HttpError(403, 'Origen no permitido.');
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin'); }
      if (method === 'OPTIONS') {
        if (!origin) throw new HttpError(403, 'Origen no permitido.');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PIT-Client'); res.writeHead(204); res.end(); return;
      }
      const mutation = !['GET', 'HEAD'].includes(method);
      if (mutation && (!allowed.has(origin) || req.headers['x-pit-client'] !== '1' || !String(req.headers['content-type']).startsWith('application/json'))) throw new HttpError(403, 'Solicitud no permitida.');
      const data = mutation ? await bodyOf(req) : {};
      if (method === 'POST' && path === '/api/auth/logout') {
        endSession(req, store, scope); res.setHeader('Set-Cookie', sessionCookie('', scope, secureCookies, 0)); json(res, 200, { ok: true }); return;
      }
      if (method === 'POST' && ['/api/auth/login', '/api/auth/register'].includes(path)) {
        const registration = path.endsWith('register');
        if (registration && scope !== 'customer') throw new HttpError(404, 'Ruta no encontrada.');
        onlyFields(data, registration ? ['name', 'email', 'password', 'marketing'] : ['email', 'password']);
        const email = emailField(data.email);
        rateLimit(store, `${scope}:${registration ? 'register' : 'login'}:${req.socket.remoteAddress}`, registration ? 10 : 30);
        rateLimit(store, `${scope}:account:${email}`, 10);
        let user = store.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (registration) {
          const name = textField(data.name, 2, 70, 'el nombre');
          if (data.marketing !== undefined && typeof data.marketing !== 'boolean') throw new HttpError(400, 'Preferencia no válida.');
          const passwordHash = await hashPassword(data.password);
          try {
            user = store.transaction(() => { const created = store.addUser({ email, name, passwordHash, marketing: data.marketing || false }); store.audit(created.id, 'customer.register', created.id); return created; });
          } catch (error) { if (String(error.message).includes('UNIQUE')) throw new HttpError(409, 'No se pudo crear la cuenta. Si ya tienes una, inicia sesión.'); throw error; }
        } else {
          // A fixed valid dummy record avoids skipping the expensive password check for unknown emails.
          const dummy = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
          const valid = await verifyPassword(data.password, user?.password_hash || dummy);
          if (!valid || !user || user.role !== scope) throw new HttpError(401, 'Correo o contraseña incorrectos para este portal.');
        }
        res.setHeader('Set-Cookie', startSession(store, user, scope, secureCookies));
        json(res, registration ? 201 : 200, { user: safeUser(user), member: scope === 'customer' ? store.member(user.id) : undefined }); return;
      }
      const user = readSession(req, store, scope);
      if (!user) throw new HttpError(401, 'Inicia sesión para continuar.');
      if (method === 'GET' && path === '/api/session') { json(res, 200, { user, member: scope === 'customer' ? getMember(store, user.id) : undefined }); return; }
      if (scope === 'customer') {
        if (method === 'GET' && path === '/api/me') { json(res, 200, getMember(store, user.id)); return; }
        if (method === 'PATCH' && path === '/api/me') {
          onlyFields(data, ['name', 'vehicle', 'marketing']);
          const name = textField(data.name, 2, 70, 'el nombre');
          if (typeof data.vehicle !== 'string' || data.vehicle.length > 100 || typeof data.marketing !== 'boolean') throw new HttpError(400, 'Perfil no válido.');
          const state = store.transaction(() => { const member = getMember(store, user.id); const next = { ...member, customer: { ...member.customer, name, vehicle: data.vehicle.trim(), marketing: data.marketing } }; store.saveMember(next); store.audit(user.id, 'customer.profile', user.id); return next; });
          json(res, 200, state); return;
        }
        if (method === 'POST' && path === '/api/me/rewards') {
          onlyFields(data, ['offerId']);
          const result = store.transaction(() => { const member = getMember(store, user.id); const result = business(() => requestReward(member, data.offerId)); store.saveMember(result.state); if (result.state !== member) store.audit(user.id, 'reward.request', user.id, { rewardId: result.reward.id }); return result; });
          json(res, 200, result); return;
        }
      } else {
        if (method === 'GET' && path === '/api/customers') {
          const search = (url.searchParams.get('search') || '').trim().toLowerCase().slice(0, 120);
          const rows = store.db.prepare("SELECT id, name, email, member FROM users WHERE role = 'customer' AND (lower(name) LIKE ? OR email LIKE ? OR id = ?) ORDER BY created_at DESC LIMIT 100").all(`%${search}%`, `%${search}%`, search);
          json(res, 200, rows.map(row => ({ id: row.id, name: row.name, email: row.email, points: balance(JSON.parse(row.member)) }))); return;
        }
        const match = /^\/api\/customers\/([a-zA-Z0-9-]+)(?:\/(services|redemptions))?$/.exec(path);
        if (match && method === 'GET' && !match[2]) { json(res, 200, getMember(store, match[1])); return; }
        if (match && method === 'POST' && match[2] === 'services') {
          onlyFields(data, ['id', 'service', 'cents', 'mode']);
          textField(data.id, 1, 80, 'la referencia');
          if (!Number.isSafeInteger(data.cents) || data.cents < 500 || data.cents > 25000) throw new HttpError(400, 'El importe debe estar entre $5 y $250.');
          const next = store.transaction(() => {
            const member = getMember(store, match[1]), previous = member.entries.find(e => e.id === data.id);
            if (previous && ['service', 'cents', 'mode'].some(k => previous[k] !== data[k])) throw new HttpError(409, 'La referencia ya pertenece a otro servicio.');
            const result = business(() => addService(member, data)); store.saveMember(result);
            if (!previous) store.audit(user.id, 'service.create', match[1], { serviceId: data.id, cents: data.cents });
            return result;
          }); json(res, 200, next); return;
        }
        if (match && method === 'POST' && match[2] === 'redemptions') {
          onlyFields(data, ['code', 'conditionsConfirmed']);
          if (data.conditionsConfirmed !== true) throw new HttpError(400, 'Comprueba las condiciones del beneficio.');
          const code = textField(data.code, 10, 10, 'el código');
          const next = store.transaction(() => { const member = getMember(store, match[1]); const result = business(() => redeem(member, code)); store.saveMember(result); store.audit(user.id, 'reward.redeem', match[1], { code }); return result; });
          json(res, 200, next); return;
        }
        if (method === 'GET' && path === '/api/rules') { json(res, 200, store.rules()); return; }
        if (method === 'PATCH' && path === '/api/rules') {
          onlyFields(data, ['thresholdCents', 'rappelPercent']);
          const rules = store.transaction(() => {
            const redemptions = store.db.prepare("SELECT member FROM users WHERE role = 'customer'").all().flatMap(r => JSON.parse(r.member).redemptions);
            const next = business(() => updateRules({ redemptions }, { ...data, pointsPerDollar: 1000 })).rules;
            store.db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(next), 'rules');
            store.audit(user.id, 'rules.update', null, next); return next;
          }); json(res, 200, rules); return;
        }
        if (method === 'GET' && path === '/api/audit') {
          json(res, 200, store.db.prepare('SELECT a.*, u.name AS actor_name FROM audit a JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 100').all().map(row => ({ ...row, details: JSON.parse(row.details) }))); return;
        }
      }
      throw new HttpError(404, 'Ruta no encontrada.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof URIError ? 400 : 500;
      json(res, status, { error: status === 500 ? 'Error interno.' : error.message });
    }
  });
}
