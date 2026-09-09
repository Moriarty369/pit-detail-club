import { z } from 'zod';
export const password = z.string().min(12, 'Usa al menos 12 caracteres.').max(128);
export const email = z.string().trim().email('Escribe un correo válido.').max(120).transform(v => v.toLowerCase());
export const loginInput = z.object({ email, password: z.string().min(1).max(128), captchaToken: z.string().max(2048).optional() }).strict();
export const registerInput = z.object({ email, password, name: z.string().trim().min(2).max(70), marketing: z.boolean().default(false), captchaToken: z.string().max(2048).optional() }).strict();
export const profileInput = z.object({ name: z.string().trim().min(2).max(70), marketing: z.boolean() }).strict();
export const vehicleInput = z.object({ kind: z.enum(['car', 'motorcycle', 'boat']), label: z.string().trim().min(2).max(100) }).strict();
export const serviceInput = z.object({ id: z.string().uuid(), customerId: z.string().uuid(), vehicleId: z.string().uuid().nullable(), service: z.enum(['Detailing exterior', 'Detailing interior', 'Detailing integral', 'Cambio de aceite', 'Mecánica básica', 'Lavado de moto', 'Detailing de embarcación']), cents: z.number().int().min(500).max(25000), mode: z.enum(['En local', 'A domicilio']) }).strict();
export const rulesInput = z.object({ thresholdCents: z.number().int().min(100).max(1000000), rappelPercent: z.number().int().min(1).max(30) }).strict();
export const factorInput = z.object({ factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/, 'Escribe los seis dígitos del autenticador.') }).strict();
export type Vehicle = { id: string; kind: 'car' | 'motorcycle' | 'boat'; label: string };
export type Member = {
  customer: { id: string; name: string; email: string; marketing: boolean };
  vehicles: Vehicle[];
  rules: { pointsPerDollar: number; thresholdCents: number; rappelPercent: number };
  entries: { id: string; service: string; cents: number; points: number; mode: string; date: string; vehicleId: string | null; voided: boolean }[];
  redemptions: { id: string; code: string; offerId: string; cost: number; percent: number | null; status: 'pending' | 'used'; date: string; expiresAt: string; period: string }[];
  points: number; quarterSpend: number; period: string;
};
export type SessionInfo = { user: { id: string; email: string; name: string }; role: 'customer' | 'admin'; mfa: { required: boolean; enrolled: boolean; currentLevel: string; factors: { id: string; friendly_name?: string }[] }; member: Member | null };
export const offers = [
  { id: 'wash', title: 'Un extra de brillo', description: 'Lavado exterior de cortesía con tu próximo servicio pagado.', cost: 150000, tag: 'EL FAVORITO', icon: 'sparkles', value: 'Lavado exterior', terms: 'Un lavado exterior por canje. Requiere un servicio pagado. No acumulable con otras ofertas.' },
  { id: 'oil', title: 'Cuida tu motor', description: '$10 de descuento en mano de obra de cambio de aceite.', cost: 100000, tag: 'MANTENIMIENTO', icon: 'oil', value: '$10 de descuento', terms: 'Aplicable a mano de obra de al menos $10. Aceite, filtros y desplazamiento excluidos. No acumulable.' },
  { id: 'detail', title: 'El siguiente nivel', description: '$20 de descuento en tu próximo detailing integral.', cost: 250000, tag: 'EXPERIENCIA PIT', icon: 'car', value: '$20 de descuento', terms: 'Servicio de detailing de al menos $80. Desplazamiento excluido. No acumulable.' },
];
export function canRequest(member: Member, id: string) {
  if (id === 'rappel') return member.quarterSpend >= member.rules.thresholdCents && !member.redemptions.some(r => r.offerId === id && r.status === 'used' && r.period === member.period);
  const offer = offers.find(o => o.id === id); return !!offer && member.points >= offer.cost;
}
export function centsFromInput(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Introduce un importe con un máximo de dos decimales.');
  const [whole, fraction = ''] = value.split('.'); const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Importe no válido.'); return cents;
}
