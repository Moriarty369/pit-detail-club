import { test, expect, type Page } from "@playwright/test";
import type { Member } from "../../cloud/shared/contracts";

const welcomeDate = "2026-09-11T12:00:00.000Z";
function member(): Member {
  return {
    customer: {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Alex de prueba",
      email: "alex@example.test",
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
  };
}
function addService(m: Member): Member {
  return {
    ...m,
    points: m.points + 5000,
    quarterSpend: 500,
    entries: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        service: "Lavado de moto",
        cents: 500,
        points: 5000,
        mode: "En local",
        date: "2026-09-12T12:00:00.000Z",
        vehicleId: null,
        voided: false,
      },
    ],
  };
}

async function mockAPI(page: Page, current: () => Member) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const m = current();
    let data: unknown;
    if (path === "/api/config")
      data = {
        portal: "customer",
        emailEnabled: true,
        googleEnabled: true,
        captchaSiteKey: null,
        dataMode: "local",
      };
    else if (path === "/api/session")
      data = {
        user: {
          id: m.customer.id,
          email: m.customer.email,
          name: m.customer.name,
        },
        role: "customer",
        mfa: {
          required: false,
          enrolled: false,
          currentLevel: "aal1",
          factors: [],
        },
        member: m,
      };
    else if (path === "/api/me") data = m;
    else {
      errors.push("Unexpected mocked route: " + path);
      await route.fulfill({
        status: 500,
        json: { error: "Unexpected test request" },
      });
      return;
    }
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: data });
  });
  return errors;
}

test("welcome counts up once and its dated movement appears in recent activity and history", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-12T12:01:00Z"));
  const m = member();
  const errors = await mockAPI(page, () => m);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "¡Bienvenido al club, Alex!" }),
  ).toBeVisible();
  await page.clock.runFor(400);
  await expect
    .poll(async () => {
      const n = Number(
        (await page.locator(".points-digits").innerText()).replaceAll(".", ""),
      );
      return n > 0 && n < 2000;
    })
    .toBe(true);
  await page.clock.runFor(2000);
  await expect(page.locator(".points-value")).toHaveText("2.000pts");
  await expect(page.locator(".points-value")).toHaveAttribute(
    "aria-label",
    "Saldo: 2.000 puntos",
  );
  await expect(page.getByLabel("Recompensa de bienvenida")).toContainText(
    "+2.000 pts",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/points-welcome-${info.project.name}.png`,
  });
  await page.getByRole("button", { name: "Ver movimiento" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu actividad." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Recompensa de bienvenida").locator("time"),
  ).toHaveAttribute("datetime", welcomeDate);
  await page.getByRole("button", { name: "En local", exact: true }).click();
  await expect(page.getByLabel("Recompensa de bienvenida")).toHaveCount(0);
  await page.getByRole("button", { name: "Bienvenida", exact: true }).click();
  await expect(page.getByLabel("Recompensa de bienvenida")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tu actividad." }),
  ).toBeVisible();
  await expect(page.getByLabel("Puntos recibidos")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("refresh celebrates a real service once, retains it after reload, and never celebrates a reversal", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-09-12T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-12T12:01:00Z"));
  let m = member();
  const errors = await mockAPI(page, () => m);
  await page.goto("/");
  await expect(page.getByLabel("Puntos recibidos")).toBeVisible();
  await page.clock.runFor(2200);
  await expect(page.locator(".points-value")).toHaveText("2.000pts");
  await page.getByRole("button", { name: "Ocultar aviso de puntos" }).click();
  m = addService(m);
  await page.getByRole("button", { name: "Actualizar saldo" }).click();
  await expect(page.getByLabel("Puntos recibidos")).toContainText(
    "+5.000 puntos",
  );
  await page.clock.runFor(400);
  await expect
    .poll(async () => {
      const n = Number(
        (await page.locator(".points-digits").innerText()).replaceAll(".", ""),
      );
      return n > 2000 && n < 7000;
    })
    .toBe(true);
  await page.clock.runFor(2000);
  await expect(page.locator(".points-value")).toHaveText("7.000pts");
  await page.screenshot({
    path: `test-results/points-service-${info.project.name}.png`,
  });
  await page.reload();
  await expect(page.locator(".points-value")).toHaveText("7.000pts");
  await expect(page.getByLabel("Puntos recibidos")).toHaveCount(0);
  m = {
    ...m,
    points: 2000,
    entries: m.entries.map((e) => ({ ...e, voided: true })),
  };
  await page.getByRole("button", { name: "Actualizar saldo" }).click();
  await expect(page.locator(".points-value")).toHaveText("2.000pts");
  await expect(page.getByLabel("Puntos recibidos")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("reduced motion gives the final balance and a readable message without motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let m = member();
  await mockAPI(page, () => m);
  await page.goto("/");
  await expect(page.getByLabel("Puntos recibidos")).toBeVisible();
  expect(await page.locator(".points-value").textContent()).toBe("2.000pts");
  expect(
    await page
      .getByLabel("Puntos recibidos")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  m = addService(m);
  await page.getByRole("button", { name: "Actualizar saldo" }).click();
  await expect(page.getByLabel("Puntos recibidos")).toContainText(
    "+5.000 puntos",
  );
  expect(await page.locator(".points-value").textContent()).toBe("7.000pts");
  await expect(page.locator(".points-announcement")).toContainText(
    "Saldo actual: 7.000 puntos",
  );
});

test("blocking browser storage keeps welcome, balance and navigation usable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  const m = member();
  const errors = await mockAPI(page, () => m);
  await page.goto("/");
  await expect(page.locator(".points-value")).toHaveText("2.000pts");
  await page.getByRole("button", { name: "Ocultar aviso de puntos" }).click();
  await page.getByRole("button", { name: "Actualizar saldo" }).click();
  await expect(page.getByLabel("Puntos recibidos")).toHaveCount(0);
  expect(errors).toEqual([]);
});
