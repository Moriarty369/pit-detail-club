import type { PointsReceipt as Receipt } from "./points-feedback";
import { Icon } from "../shared/icons";
import { number } from "../shared/ui";

export function PointsReceipt({
  receipt,
  name,
  dismiss,
  showActivity,
}: {
  receipt: Receipt;
  name: string;
  dismiss: () => void;
  showActivity: () => void;
}) {
  return (
    <section className="points-receipt" aria-label="Puntos recibidos">
      <span className="points-receipt-icon" aria-hidden="true">
        <Icon name={receipt.kind === "welcome" ? "gift" : "sparkles"} />
      </span>
      <div className="points-receipt-copy">
        <span className="eyebrow">
          {receipt.kind === "welcome"
            ? "TU PRIMER REGALO PIT"
            : "CADA SERVICIO SUMA"}
        </span>
        <h2>
          {receipt.kind === "welcome"
            ? `¡Bienvenido al club, ${name}!`
            : "Tu cuidado tiene recompensa."}
        </h2>
        <p>
          <strong>+{number(receipt.points)} puntos</strong>
          {receipt.kind === "welcome"
            ? " de bienvenida. Ya forman parte de tu saldo."
            : ` por ${receipt.services === 1 ? "tu servicio" : "tus servicios"}. Ya están en tu cuenta.`}
        </p>
        <button className="text-button" onClick={showActivity}>
          Ver movimiento <Icon name="arrow" />
        </button>
      </div>
      <button
        className="points-receipt-close"
        aria-label="Ocultar aviso de puntos"
        onClick={dismiss}
      >
        <Icon name="close" />
      </button>
    </section>
  );
}
