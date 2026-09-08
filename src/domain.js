export const offers = [
  { id: 'wash', title: 'Un extra de brillo', description: 'Lavado exterior de cortesía con tu próximo servicio pagado.', cost: 1500, tag: 'EL FAVORITO', icon: 'sparkles', value: 'Lavado exterior', terms: 'Un lavado exterior por canje. Requiere un servicio pagado. No acumulable con otras ofertas.' },
  { id: 'oil', title: 'Cuida tu motor', description: '$10 de descuento en mano de obra de cambio de aceite.', cost: 1000, tag: 'MANTENIMIENTO', icon: 'oil', value: '$10 de descuento', terms: 'Aplicable a mano de obra de al menos $10. Aceite, filtros y desplazamiento excluidos. No acumulable.' },
  { id: 'detail', title: 'El siguiente nivel', description: '$20 de descuento en tu próximo detailing integral.', cost: 2500, tag: 'EXPERIENCIA PIT', icon: 'car', value: '$20 de descuento', terms: 'Servicio de detailing de al menos $80. Desplazamiento excluido. No acumulable.' },
];
export const services = ['Detailing exterior', 'Detailing interior', 'Detailing integral', 'Cambio de aceite', 'Mecánica básica'];
const uid = () => globalThis.crypto.randomUUID();
export function quarter(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', year: 'numeric', month: 'numeric' }).formatToParts(date);
  return `${parts.find(p => p.type === 'year').value}-T${Math.ceil(Number(parts.find(p => p.type === 'month').value) / 3)}`;
}
export function createState(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = Math.floor(now.getUTCMonth() / 3) * 3;
  const dates = [1, 2, 3].map(day => new Date(Date.UTC(year, month, day, 16)).toISOString());
  return {
    version: 1, customer: { id: 'PIT-0001', name: 'Alex Mendoza', email: 'alex@example.com', vehicle: 'Toyota Corolla · 2020', marketing: false },
    rules: { pointsPerDollar: 10, thresholdCents: 25000, rappelPercent: 5 },
    entries: [
      { id: 'demo-1', service: 'Detailing exterior', cents: 6500, points: 650, mode: 'En local', date: dates[0] },
      { id: 'demo-2', service: 'Cambio de aceite', cents: 3500, points: 350, mode: 'A domicilio', date: dates[1] },
      { id: 'demo-3', service: 'Detailing interior', cents: 2500, points: 250, mode: 'En local', date: dates[2] },
    ], redemptions: [],
  };
}
export function createMemberState(customer, now = new Date()) {
  const base = createState(now);
  return {
    ...base,
    customer: { ...base.customer, ...customer, id: customer.id || `PIT-${uid().slice(0, 8).toUpperCase()}`, vehicle: customer.vehicle || '' },
    entries: [{ id: 'first-service-demo', service: 'Detailing exterior', cents: 6500, points: 650, mode: 'En local', date: now.toISOString() }],
    redemptions: [],
  };
}
export function balance(state) { return state.entries.reduce((n, e) => n + e.points, 0) - state.redemptions.filter(r => r.status === 'used').reduce((n, r) => n + r.cost, 0); }
export function quarterSpend(state, now = new Date()) { return state.entries.filter(e => quarter(new Date(e.date)) === quarter(now)).reduce((n, e) => n + e.cents, 0); }
export function addService(state, { id, service, cents, mode }, now = new Date()) {
  if (!id || typeof id !== 'string') throw new Error('Falta el identificador del servicio.');
  if (state.entries.some(e => e.id === id)) return state;
  if (!services.includes(service) || !['En local', 'A domicilio'].includes(mode)) throw new Error('Selecciona un servicio y una modalidad válidos.');
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1000000) throw new Error('Introduce un importe entre $0,01 y $10.000.');
  return { ...state, entries: [...state.entries, { id, service, cents, mode, points: Math.floor(cents * state.rules.pointsPerDollar / 100), date: now.toISOString() }] };
}
export function available(state, id, now = new Date()) {
  if (id === 'rappel') return quarterSpend(state, now) >= state.rules.thresholdCents && !state.redemptions.some(r => r.offerId === id && r.period === quarter(now) && r.status === 'used');
  const offer = offers.find(o => o.id === id);
  return !!offer && balance(state) >= offer.cost;
}
export function requestReward(state, offerId, now = new Date()) {
  if (!available(state, offerId, now)) throw new Error('Este beneficio todavía no está disponible.');
  const existing = state.redemptions.find(r => r.offerId === offerId && r.status === 'pending' && new Date(r.expiresAt) > now && (offerId !== 'rappel' || r.period === quarter(now)));
  if (existing) return { state, reward: existing };
  const reward = { id: uid(), code: uid().replaceAll('-', '').slice(0, 10).toUpperCase(), offerId, cost: offers.find(o => o.id === offerId)?.cost ?? 0, percent: offerId === 'rappel' ? state.rules.rappelPercent : null, period: quarter(now), status: 'pending', date: now.toISOString(), expiresAt: new Date(now.getTime() + 300000).toISOString() };
  return { state: { ...state, redemptions: [...state.redemptions, reward] }, reward };
}
export function redeem(state, code, now = new Date()) {
  const reward = state.redemptions.find(r => r.code === String(code).trim().toUpperCase());
  if (!reward) throw new Error('No encontramos ese código.');
  if (reward.status === 'used') throw new Error('Este código ya fue utilizado.');
  if (new Date(reward.expiresAt) <= now) throw new Error('El código ha caducado. Genera uno nuevo desde la cuenta del cliente.');
  if (reward.offerId === 'rappel' && reward.period !== quarter(now)) throw new Error('El período de este beneficio ha finalizado.');
  if (!available(state, reward.offerId, now)) throw new Error('El cliente ya no cumple las condiciones de este beneficio.');
  return { ...state, redemptions: state.redemptions.map(r => r.id === reward.id ? { ...r, status: 'used', usedAt: now.toISOString() } : r) };
}
export function updateRules(state, { pointsPerDollar, thresholdCents, rappelPercent }) {
  if (!Number.isInteger(pointsPerDollar) || pointsPerDollar < 1 || pointsPerDollar > 100 || !Number.isSafeInteger(thresholdCents) || thresholdCents < 100 || thresholdCents > 1000000 || !Number.isInteger(rappelPercent) || rappelPercent < 1 || rappelPercent > 30) throw new Error('Revisa las reglas: 1–100 puntos/$, umbral $1–$10.000 y rappel 1–30%.');
  if (state.redemptions.some(r => r.status === 'pending' && new Date(r.expiresAt) > new Date())) throw new Error('Espera a que caduquen o se validen los códigos activos antes de cambiar las reglas.');
  return { ...state, rules: { pointsPerDollar, thresholdCents, rappelPercent } };
}
