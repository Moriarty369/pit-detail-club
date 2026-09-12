// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  renderHook,
  act,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  earnedPoints,
  pointsSnapshot,
  usePointsFeedback,
} from "../client/points-feedback";
import { memberActivity } from "../shared/activity";
import type { Member } from "../shared/contracts";

const welcomeDate = "2026-09-11T12:00:00.000Z";
const serviceDate = "2026-09-12T12:00:00.000Z";
const member = (): Member => ({
  customer: {
    id: crypto.randomUUID(),
    name: "Cliente de prueba",
    email: "client@example.test",
    marketing: false,
  },
  vehicles: [],
  entries: [],
  redemptions: [],
  points: 2000,
  welcomeReward: { points: 2000, date: welcomeDate },
  rules: { pointsPerDollar: 1000, thresholdCents: 25000, rappelPercent: 5 },
  quarterSpend: 0,
  period: "2026-Q3",
});
const service = (
  id = "service-1",
  date = serviceDate,
): Member["entries"][number] => ({
  id,
  date,
  service: "Lavado de moto",
  cents: 500,
  points: 5000,
  mode: "En local",
  vehicleId: null,
  voided: false,
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("welcome is an actual grant, never inferred for older accounts or repeated snapshots", () => {
  const m = member();
  expect(earnedPoints(m, null)).toEqual({
    kind: "welcome",
    points: 2000,
    services: 0,
  });
  expect(earnedPoints(m, pointsSnapshot(m))).toBeNull();
  expect(
    earnedPoints({ ...m, points: 0, welcomeReward: null }, null),
  ).toBeNull();
  expect(earnedPoints({ ...m, entries: [service()] }, null)).toBeNull();
});

test("new service IDs count once, including simultaneous services; voids and redemptions do not celebrate", () => {
  const m = member();
  const first = { ...m, points: 7000, entries: [service()] };
  expect(earnedPoints(first, pointsSnapshot(m))?.points).toBe(5000);
  const simultaneous = {
    ...first,
    points: 12000,
    entries: [...first.entries, service("service-2")],
  };
  expect(earnedPoints(simultaneous, pointsSnapshot(first))).toEqual({
    kind: "service",
    points: 5000,
    services: 1,
  });
  expect(earnedPoints(simultaneous, pointsSnapshot(simultaneous))).toBeNull();
  expect(
    earnedPoints(
      { ...first, points: 2000, entries: [{ ...service(), voided: true }] },
      pointsSnapshot(first),
    ),
  ).toBeNull();
  expect(
    earnedPoints({ ...first, points: 0 }, pointsSnapshot(first)),
  ).toBeNull();
});

test("reduced motion shows final server balance, persists the welcome and isolates accounts", () => {
  motion(true);
  const m = member();
  const first = renderHook(({ value }) => usePointsFeedback(value), {
    initialProps: { value: m },
  });
  expect(first.result.current.displayed).toBe(2000);
  expect(first.result.current.receipt?.kind).toBe("welcome");
  first.unmount();
  const next = renderHook(({ value }) => usePointsFeedback(value), {
    initialProps: { value: m },
  });
  expect(next.result.current.receipt).toBeNull();
  next.rerender({ value: { ...m, points: 7000, entries: [service()] } });
  expect(next.result.current.displayed).toBe(7000);
  expect(next.result.current.receipt?.points).toBe(5000);
  next.rerender({ value: member() });
  expect(next.result.current.displayed).toBe(2000);
  expect(next.result.current.receipt?.kind).toBe("welcome");
});

test("animation advances through intermediate values and cancels immediately for a reversal", () => {
  motion(false);
  let tick: FrameRequestCallback | undefined;
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback) => {
      tick = callback;
      return 1;
    }),
  );
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const m = member();
  const { result, rerender } = renderHook(
    ({ value }) => usePointsFeedback(value),
    { initialProps: { value: m } },
  );
  expect(result.current.displayed).toBe(0);
  act(() => tick!(700));
  expect(result.current.displayed).toBeGreaterThan(0);
  expect(result.current.displayed).toBeLessThan(2000);
  act(() => tick!(2000));
  expect(result.current.displayed).toBe(2000);
  rerender({ value: { ...m, points: 7000, entries: [service()] } });
  act(() => tick!(400));
  expect(result.current.displayed).toBeGreaterThan(2000);
  rerender({ value: { ...m, entries: [{ ...service(), voided: true }] } });
  expect(result.current.displayed).toBe(2000);
  expect(result.current.receipt).toBeNull();
  expect(cancel).toHaveBeenCalled();
});

test("blocked storage does not break access or repeat a grant during the page session", () => {
  motion(true);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const m = member();
  const first = renderHook(() => usePointsFeedback(m));
  expect(first.result.current.receipt?.points).toBe(2000);
  first.unmount();
  const next = renderHook(() => usePointsFeedback(m));
  expect(next.result.current.receipt).toBeNull();
  expect(next.result.current.displayed).toBe(2000);
});

function motion(reduced: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}
