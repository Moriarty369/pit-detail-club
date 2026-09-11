export type Vehicle = {
  id: string;
  kind: "car" | "motorcycle" | "boat";
  label: string;
};
export type Member = {
  customer: { id: string; name: string; email: string; marketing: boolean };
  vehicles: Vehicle[];
  rules: {
    pointsPerDollar: number;
    thresholdCents: number;
    rappelPercent: number;
  };
  entries: {
    id: string;
    service: string;
    cents: number;
    points: number;
    mode: string;
    date: string;
    vehicleId: string | null;
    voided: boolean;
  }[];
  redemptions: {
    id: string;
    code: string;
    offerId: string;
    cost: number;
    percent: number | null;
    status: "pending" | "used";
    date: string;
    expiresAt: string;
    period: string;
  }[];
  points: number;
  quarterSpend: number;
  period: string;
};
export type SessionInfo = {
  user: { id: string; email: string; name: string };
  role: "customer" | "admin";
  mfa: {
    required: boolean;
    enrolled: boolean;
    currentLevel: string;
    factors: { id: string; friendly_name?: string }[];
  };
  member: Member | null;
};
export const offers = [
  {
    id: "wash",
    title: "Un extra de brillo",
    description: "Lavado exterior de cortesía con tu próximo servicio pagado.",
    cost: 150000,
    tag: "EL FAVORITO",
    icon: "sparkles",
    value: "Lavado exterior",
    terms:
      "Un lavado exterior por canje. Requiere un servicio pagado. No acumulable con otras ofertas.",
  },
  {
    id: "oil",
    title: "Cuida tu motor",
    description: "$10 de descuento en mano de obra de cambio de aceite.",
    cost: 100000,
    tag: "MANTENIMIENTO",
    icon: "oil",
    value: "$10 de descuento",
    terms:
      "Aplicable a mano de obra de al menos $10. Aceite, filtros y desplazamiento excluidos. No acumulable.",
  },
  {
    id: "detail",
    title: "El siguiente nivel",
    description: "$20 de descuento en tu próximo detailing integral.",
    cost: 250000,
    tag: "EXPERIENCIA PIT",
    icon: "car",
    value: "$20 de descuento",
    terms:
      "Servicio de detailing de al menos $80. Desplazamiento excluido. No acumulable.",
  },
];
export function canRequest(member: Member, id: string) {
  if (id === "rappel")
    return (
      member.quarterSpend >= member.rules.thresholdCents &&
      !member.redemptions.some(
        (r) =>
          r.offerId === id && r.status === "used" && r.period === member.period,
      )
    );
  const offer = offers.find((o) => o.id === id);
  return !!offer && member.points >= offer.cost;
}
export function centsFromInput(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Introduce un importe con un máximo de dos decimales.");
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Importe no válido.");
  return cents;
}
