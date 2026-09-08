import '../src/style.css';
import '../src/cards.css';
import './admin.css';
import { createApiClient } from '../src/api-client.js';
import { services, balance } from '../src/domain.js';
import QRCode from 'qrcode';

const api = createApiClient();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => new Intl.NumberFormat('es-VE').format(value);
const money = cents => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(cents / 100);
const date = value => new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Caracas' }).format(new Date(value));
const app = document.querySelector('#admin-app');
let user = null, customers = [], selected = null, rules = null, audit = [], view = 'customers', timer;
function notify(message) { const box = document.querySelector('#admin-status'); box.textContent = message; clearTimeout(timer); timer = setTimeout(() => { box.textContent = ''; }, 6000); }
function header() { return `<header class="admin-header"><div><img src="${import.meta.env.BASE_URL}pit-detail.jpg" alt="PIT DETAIL"><strong>ADMINISTRACIÓN</strong></div>${user ? `<div><span>${esc(user.name)}</span><button class="button secondary" data-action="logout">Cerrar sesión</button></div>` : ''}</header>`; }
function render() {
  if (!user) {
    app.innerHTML = `${header()}<main class="admin-login"><h1>Acceso al negocio.</h1><p>Portal exclusivo para administradores. Las cuentas de clientes acceden desde el club.</p><form id="login-form"><label>Correo electrónico<input name="email" type="email" autocomplete="username" required maxlength="120"></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><button class="button primary" type="submit">Entrar a administración</button></form><div id="admin-error" role="alert"></div></main>`;
    return;
  }
  app.innerHTML = `${header()}<main class="admin-shell"><nav class="admin-nav" aria-label="Administración">${[['customers', 'Clientes y servicios'], ['rules', 'Reglas del club'], ['audit', 'Actividad'], ['qr', 'QR del club']].map(([id, label]) => `<button class="button secondary ${view === id ? 'selected' : ''}" data-view="${id}">${label}</button>`).join('')}</nav>${({ customers: customersPage, rules: rulesPage, audit: auditPage, qr: qrPage })[view]()}</main>`;
}
function customersPage() {
  return `<h1>Clientes y servicios.</h1><p class="muted">El importe del servicio determina los puntos: cada $1 suma 1.000.</p><form id="search-form" class="admin-search"><label>Buscar cliente<input name="search" placeholder="Nombre, correo o identificador del QR" maxlength="160"></label><button class="button secondary" type="submit">Buscar</button></form><div class="customer-list">${customers.length ? customers.map(c => `<article class="customer-item"><div><strong>${esc(c.name)}</strong><p>${esc(c.email)} · ${number(c.points)} puntos</p></div><button class="button secondary" data-customer="${esc(c.id)}">Abrir cliente</button></article>`).join('') : '<p class="empty-text">No hay clientes que coincidan. El cliente debe registrarse en el club.</p>'}</div>${selected ? memberPanel() : ''}`;
}
function memberPanel() {
  return `<section class="admin-member"><span class="eyebrow">CLIENTE SELECCIONADO</span><h2>${esc(selected.customer.name)}</h2><p>${esc(selected.customer.email)} · <strong>${number(balance(selected))} puntos</strong></p><p class="small-note">${esc(selected.customer.id)} · ${esc(selected.customer.vehicle || 'Vehículo sin registrar')}</p><div class="admin-grid"><section class="form-card"><h2>Registrar un servicio</h2><form id="service-form" data-id="${crypto.randomUUID()}"><label>Servicio<select name="service" aria-label="Servicio">${services.map(s => `<option>${s}</option>`).join('')}</select></label><label>Importe pagado (USD)<input name="amount" type="number" min="5" max="250" step="0.01" required></label><label>Modalidad<select name="mode" aria-label="Modalidad"><option>En local</option><option>A domicilio</option></select></label><p class="small-note">Base elegible sin desplazamiento. Los puntos se calculan al registrar el servicio.</p><button class="button primary" type="submit">Registrar y sumar puntos</button></form></section><section class="form-card"><h2>Validar un beneficio</h2><form id="redeem-form"><label>Código de canje<input name="code" minlength="10" maxlength="10" pattern="[A-Fa-f0-9]{10}" required autocomplete="off"></label><label class="checkbox-label"><input name="conditions" type="checkbox" required><span>He comprobado las condiciones del beneficio y que no se acumula con otra promoción.</span></label><button class="button dark" type="submit">Validar canje</button></form></section></div><section class="recent-panel"><h2>Historial del cliente</h2>${selected.entries.length ? [...selected.entries].reverse().map(e => `<article class="service-row"><div class="service-info"><strong>${esc(e.service)}</strong><span>${date(e.date)} · ${esc(e.mode)}</span></div><div class="service-amount"><strong>+${number(e.points)} pts</strong><span>${money(e.cents)}</span></div></article>`).join('') : '<p class="empty-text">Aún no tiene servicios registrados.</p>'}</section></section>`;
}
function rulesPage() { return `<section class="form-card"><h1>Reglas del club.</h1><p class="muted">Se aplican a todos los clientes. La tasa se mantiene en 1.000 puntos por dólar.</p><form id="rules-form"><label>Umbral trimestral (USD)<input name="threshold" type="number" min="1" max="10000" step="0.01" value="${rules.thresholdCents / 100}" required></label><label>Rappel (%)<input name="percent" type="number" min="1" max="30" value="${rules.rappelPercent}" required></label><button class="button primary" type="submit">Guardar reglas</button></form></section>`; }
function auditPage() { return `<section class="form-card admin-audit"><h1>Actividad del negocio.</h1><p class="muted">Últimas 100 operaciones. Los servicios y canjes conservan la identidad de quien los registró.</p>${audit.map(e => `<article><strong>${esc(({ 'service.create': 'Servicio registrado', 'reward.redeem': 'Canje validado', 'reward.request': 'Canje solicitado', 'customer.register': 'Cliente registrado', 'customer.profile': 'Perfil actualizado', 'rules.update': 'Reglas actualizadas', 'admin.bootstrap': 'Administrador creado' })[e.action] || e.action)}</strong><p>${esc(e.actor_name)} · ${date(e.created_at)}</p>${e.customer_id ? `<p>Cliente: ${esc(e.customer_id)}</p>` : ''}</article>`).join('')}</section>`; }
function qrPage() { return `<section class="form-card"><h1>QR de acceso al club.</h1><p class="muted">Este enlace debe apuntar al portal público de clientes.</p><form id="qr-form"><label>URL pública del club<input name="url" type="url" placeholder="https://club.tu-dominio.com" required></label><button class="button primary" type="submit">Generar QR</button></form><div id="qr-output"></div></section>`; }
async function refreshCustomers(search = '') { customers = await api(`/customers?search=${encodeURIComponent(search.replace(/^PIT-(?:CUSTOMER|DEMO):/, ''))}`); }
async function failure(error) {
  if (error.status === 401) { user = null; selected = null; render(); }
  const box = document.querySelector('#admin-error'); if (box) box.textContent = error.message; else notify(error.message);
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  try {
    if (button.dataset.action === 'logout') { await api('/auth/logout', { method: 'POST', body: {} }); user = null; selected = null; render(); return; }
    if (!user) return;
    if (button.dataset.view) {
      view = button.dataset.view;
      if (view === 'customers') await refreshCustomers();
      if (view === 'rules') rules = await api('/rules');
      if (view === 'audit') audit = await api('/audit');
      render();
    }
    if (button.dataset.customer) { selected = await api(`/customers/${button.dataset.customer}`); render(); document.querySelector('.admin-member').scrollIntoView({ behavior: 'smooth' }); }
  } catch (error) { await failure(error); }
});
document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; if (form.dataset.busy) return;
  form.dataset.busy = '1'; const submit = form.querySelector('[type="submit"]'); if (submit) submit.disabled = true;
  const data = new FormData(form);
  try {
    if (form.id === 'login-form') { const result = await api('/auth/login', { method: 'POST', body: { email: data.get('email'), password: data.get('password') } }); user = result.user; view = 'customers'; await refreshCustomers(); render(); return; }
    if (!user) return;
    if (form.id === 'search-form') { await refreshCustomers(String(data.get('search') || '')); selected = null; render(); }
    if (form.id === 'service-form') {
      selected = await api(`/customers/${selected.customer.id}/services`, { method: 'POST', body: { id: form.dataset.id, service: data.get('service'), cents: Math.round(Number(data.get('amount')) * 100), mode: data.get('mode') } });
      await refreshCustomers(); render(); notify('Servicio registrado. Los puntos ya están en la cuenta del cliente.');
    }
    if (form.id === 'redeem-form') { selected = await api(`/customers/${selected.customer.id}/redemptions`, { method: 'POST', body: { code: data.get('code'), conditionsConfirmed: data.has('conditions') } }); await refreshCustomers(); render(); notify('Canje validado.'); }
    if (form.id === 'rules-form') { rules = await api('/rules', { method: 'PATCH', body: { thresholdCents: Math.round(Number(data.get('threshold')) * 100), rappelPercent: Number(data.get('percent')) } }); render(); notify('Reglas actualizadas para todos los clientes.'); }
    if (form.id === 'qr-form') {
      const url = new URL(String(data.get('url')));
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Introduce una URL pública HTTPS sin credenciales.');
      url.hash = 'login'; document.querySelector('#qr-output').innerHTML = `<div class="qr-frame"><canvas id="entry-canvas"></canvas></div><p class="small-note">${esc(url.href)}</p>`;
      await QRCode.toCanvas(document.querySelector('#entry-canvas'), url.href, { width: 220, margin: 2 });
    }
  } catch (error) { await failure(error); }
  finally { delete form.dataset.busy; if (submit) submit.disabled = false; }
});
async function start() {
  try { const result = await api('/session'); user = result.user; await refreshCustomers(); }
  catch (error) { if (error.status !== 401) notify('No se pudo conectar con el servidor administrativo.'); }
  render();
}
start();
