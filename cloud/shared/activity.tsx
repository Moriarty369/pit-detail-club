import type { Member } from "./contracts";
import { Icon } from "./icons";
import { date, number } from "./ui";

export type MemberActivity =
  | { kind: "welcome"; id: string; date: string; points: number }
  | {
      kind: "service";
      id: string;
      date: string;
      entry: Member["entries"][number];
    };

export function memberActivity(member: Member): MemberActivity[] {
  const items: MemberActivity[] = member.entries.map((entry) => ({
    kind: "service",
    id: entry.id,
    date: entry.date,
    entry,
  }));
  if (member.welcomeReward)
    items.push({
      kind: "welcome",
      id: "welcome:" + member.customer.id,
      ...member.welcomeReward,
    });
  return items.sort(
    (a, b) =>
      Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id),
  );
}

export function WelcomeActivity({
  points,
  date: awardedAt,
}: {
  points: number;
  date: string;
}) {
  return (
    <article
      className="service-row welcome-activity"
      aria-label="Recompensa de bienvenida"
    >
      <span className="service-icon">
        <Icon name="gift" />
      </span>
      <div className="service-info">
        <strong>Bienvenida al club</strong>
        <span>
          <time dateTime={awardedAt}>{date(awardedAt)}</time> · Recompensa única
        </span>
      </div>
      <div className="service-amount">
        <strong>+{number(points)} pts</strong>
      </div>
    </article>
  );
}
