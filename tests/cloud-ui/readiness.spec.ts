import { test, expect, type Page } from "@playwright/test";
import type { Member } from "../../cloud/shared/contracts";

// Fault injection/UI integration. All requests use fictitious responses; no live credentials.
function fixture(): Member {
  return {
    customer: {
      id: "10000000-0000-4000-8000-000000000091",
      name: "Cliente de prueba",
      email: "fixture@example.test",
      marketing: false,
    },
    vehicles: [
      { id: "car", kind: "car", label: "Toyota Corolla" },
      { id: "moto", kind: "motorcycle", label: "Yamaha FZ" },
      { id: "boat", kind: "boat", label: "Lancha de prueba" },
    ],
    points: 102000,
    welcomeReward: { points: 2000, date: "2026-09-11T12:00:00Z" },
    rules: { pointsPerDollar: 1000, thresholdCents: 25000, rappelPercent: 5 },
    entries: [
      {
        id: "service",
        service: "Lavado y detailing",
        cents: 10000,
        points: 100000,
        mode: "En local",
        date: "2026-09-12T12:00:00Z",
        vehicleId: "car",
        voided: false,
      },
    ],
    quarterSpend: 10000,
    period: "2026-Q3",
    redemptions: [
      {
        id: "reward",
        code: "12345678",
        offerId: "oil",
        cost: 100000,
        percent: null,
        status: "pending",
        date: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        period: "2026-Q3",
      },
    ],
  };
}
async function setup(page: Page) {
  const state = {
    member: fixture() as Member | null,
    signedIn: true,
    meStatus: 200,
    authStatus: 503,
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let status = 200,
      data: unknown;
    if (path === "/api/config")
      data = {
        portal: "customer",
        emailEnabled: true,
        googleEnabled: true,
        captchaSiteKey: null,
      };
    else if (path === "/api/session") {
      status = state.signedIn ? 200 : 401;
      data = state.signedIn
        ? {
            user: {
              id: "10000000-0000-4000-8000-000000000091",
              name: "Cliente de prueba",
              email: "fixture@example.test",
            },
            role: "customer",
            member: state.member,
            mfa: {
              required: false,
              enrolled: false,
              currentLevel: "aal1",
              factors: [],
            },
          }
        : { error: "Inicia sesión para continuar." };
    } else if (path === "/api/me") {
      status = state.meStatus;
      data =
        status === 200
          ? state.member
          : {
              error:
                status === 401
                  ? "Inicia sesión para continuar."
                  : "Servicio temporalmente no disponible.",
            };
    } else if (path === "/api/auth/logout") {
      state.signedIn = false;
      data = { ok: true };
    } else if (
      ["/api/auth/login", "/api/auth/forgot", "/api/auth/register"].includes(
        path,
      )
    ) {
      status = state.authStatus;
      data = {
        error:
          status === 429
            ? "Demasiados intentos. Espera unos minutos."
            : "Servicio temporalmente no disponible.",
      };
    } else {
      errors.push("Unexpected route " + path);
      status = 500;
      data = { error: "Unexpected fixture request" };
    }
    await route.fulfill({ status, json: data });
  });
  return { state, errors };
}
test("a validated reward refreshes its open dialog and shows the actual deducted balance", async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  await page.goto("/#rewards");
  await page.getByRole("button", { name: "Ver código", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Válido durante");
  state.member = {
    ...state.member!,
    points: 2000,
    redemptions: state.member!.redemptions.map((r) => ({
      ...r,
      status: "used",
    })),
  };
  await dialog.getByRole("button", { name: "Comprobar canje" }).click();
  await expect(dialog).toContainText("Código utilizado.");
  await expect(dialog).toContainText("100.000 puntos descontados.");
  await expect(dialog).not.toContainText("se descontarán");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.goto("/#home");
  await expect(page.locator(".points-value")).toHaveText("2.000pts");
  expect(errors).toEqual([]);
});
test("an expired code cannot be presented as valid", async ({ page }) => {
  const { state, errors } = await setup(page);
  state.member!.redemptions[0].expiresAt = new Date(
    Date.now() + 8000,
  ).toISOString();
  await page.clock.install();
  await page.goto("/#rewards");
  await page.getByRole("button", { name: "Ver código", exact: true }).click();
  await page.clock.fastForward(10000);
  await expect(page.getByRole("dialog")).toContainText("Código caducado");
  expect(errors).toEqual([]);
});
test("a failed refresh preserves the balance and permits a successful retry", async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  await page.goto("/");
  await expect(page.locator(".points-value")).toHaveText("102.000pts");
  state.meStatus = 503;
  await page.getByRole("button", { name: "Actualizar saldo" }).click();
  await expect(page.getByRole("alert")).toContainText("temporalmente");
  await expect(page.locator(".points-value")).toHaveText("102.000pts");
  state.meStatus = 200;
  await page.getByRole("button", { name: "Actualizar saldo" }).click();
  await expect(page.getByRole("alert")).toBeEmpty();
  expect(errors).toEqual([]);
});
test("an expired session returns to login without displaying customer data", async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  await page.goto("/");
  await expect(page.locator(".points-value")).toBeVisible();
  state.meStatus = 401;
  await page.getByRole("button", { name: "Actualizar saldo" }).click();
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await expect(page.locator(".points-value")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("missing member data produces an actionable page instead of a blank screen", async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  state.member = null;
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tu cuenta necesita atención." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  expect(errors).toEqual([]);
});
test("customer views fit 320–1440px with cars, motorcycles and boats and no administration navigation", async ({
  page,
}, info) => {
  const { errors } = await setup(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ["home", "rewards", "history", "profile"]) {
      await page.goto("/#" + view);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: /Asignar puntos|Administración/ }),
      ).toHaveCount(0);
    }
  }
  await page.screenshot({
    path: `test-results/readiness-profile-${info.project.name}.png`,
  });
  expect(errors).toEqual([]);
});
test("email login handles outages and throttling without allowing access", async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  state.signedIn = false;
  await page.goto("/");
  await page.getByLabel("Correo electrónico").fill("fixture@icloud.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Fictitious-test-password!");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("temporalmente");
  state.authStatus = 429;
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Demasiados intentos");
  await expect(
    page.getByRole("button", { name: "Continuar", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".points-value")).toHaveCount(0);
  expect(errors).toEqual([]);
});
