import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Member } from "../shared/contracts";

type Snapshot = {
  version: 1;
  balance: number;
  welcomeDate: string | null;
  serviceThrough: number;
  serviceIds: string[];
};
export type PointsReceipt = {
  kind: "welcome" | "service";
  points: number;
  services: number;
};
const memory = new Map<string, Snapshot>();
const storageKey = (id: string) => "pit-points-feedback:v1:" + id;

export function pointsSnapshot(member: Member): Snapshot {
  const through = member.entries.reduce(
    (latest, e) => Math.max(latest, Date.parse(e.date)),
    0,
  );
  return {
    version: 1,
    balance: member.points,
    welcomeDate: member.welcomeReward?.date ?? null,
    serviceThrough: through,
    serviceIds: member.entries
      .filter((e) => Date.parse(e.date) === through)
      .map((e) => e.id),
  };
}

function readSnapshot(id: string): Snapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(id)) || "null");
    if (
      value?.version === 1 &&
      Number.isSafeInteger(value.balance) &&
      value.balance >= 0 &&
      Number.isFinite(value.serviceThrough) &&
      value.serviceThrough >= 0 &&
      (value.welcomeDate === null || typeof value.welcomeDate === "string") &&
      Array.isArray(value.serviceIds) &&
      value.serviceIds.every((s: unknown) => typeof s === "string")
    )
      return value;
  } catch {
    /* Safari/private mode can block storage. Presentation still works. */
  }
  return memory.get(id) ?? null;
}

function remember(id: string, snapshot: Snapshot) {
  // Only a presentation checkpoint: no tokens, names or permissions. Never sent to the API.
  memory.set(id, snapshot);
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(snapshot));
  } catch {}
}

export function earnedPoints(
  member: Member,
  previous: Snapshot | null,
): PointsReceipt | null {
  const welcome = member.welcomeReward;
  if (!previous) {
    return welcome &&
      !member.entries.length &&
      !member.redemptions.some((r) => r.status === "used")
      ? { kind: "welcome", points: welcome.points, services: 0 }
      : null;
  }
  const added = member.entries.filter(
    (entry) =>
      !entry.voided &&
      (Date.parse(entry.date) > previous.serviceThrough ||
        (Date.parse(entry.date) === previous.serviceThrough &&
          !previous.serviceIds.includes(entry.id))),
  );
  if (added.length)
    return {
      kind: "service",
      points: added.reduce((sum, entry) => sum + entry.points, 0),
      services: added.length,
    };
  if (welcome && !previous.welcomeDate)
    return { kind: "welcome", points: welcome.points, services: 0 };
  return null;
}

export function usePointsFeedback(member: Member | null) {
  const [displayed, setDisplayed] = useState(member?.points ?? 0);
  const [receipt, setReceipt] = useState<PointsReceipt | null>(null);
  const [animation, setAnimation] = useState<{
    from: number;
    to: number;
    delay: number;
  } | null>(null);
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const previous = useRef<{ id: string; snapshot: Snapshot } | null>(null);
  const visible = useRef(displayed);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const changed = () => setReduced(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);

  useLayoutEffect(() => {
    if (!member) return;
    const id = member.customer.id;
    const sameUser = previous.current?.id === id;
    const before = sameUser ? previous.current!.snapshot : readSnapshot(id);
    const nextReceipt = earnedPoints(member, before);
    const next = pointsSnapshot(member);
    previous.current = { id, snapshot: next };
    remember(id, next);
    if (!sameUser || nextReceipt || before?.balance !== member.points) {
      // Animate confirmed positive changes only. Redemptions/reversals update immediately.
      const from =
        !reduced && nextReceipt && (!before || member.points > before.balance)
          ? Math.min(
              member.points,
              Math.max(
                0,
                sameUser
                  ? visible.current
                  : (before?.balance ?? member.points - nextReceipt.points),
              ),
            )
          : member.points;
      visible.current = from;
      setDisplayed(from);
      setReceipt(nextReceipt);
      setAnimation({
        from,
        to: member.points,
        delay: nextReceipt?.kind === "welcome" ? 350 : 0,
      });
    }
  }, [member, reduced]);

  useEffect(() => {
    if (!animation) return;
    const { from, to, delay } = animation;
    let frame = 0;
    const setValue = (value: number) => {
      visible.current = value;
      setDisplayed(value);
    };
    if (reduced || from >= to) {
      setValue(to);
      setAnimation(null);
      return;
    }
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - start) / 1400));
      setValue(Math.round(from + (to - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setAnimation(null);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animation, reduced]);

  return { displayed, receipt, dismiss: () => setReceipt(null) };
}
