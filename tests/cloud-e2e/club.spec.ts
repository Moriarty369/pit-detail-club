import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const config = JSON.parse(
  readFileSync(".local/cloud-test-config.json", "utf8"),
);
test.beforeEach(async ({ page }, info) => {
  // Independent local test clients must not consume one shared IP's login budget.
  // On Cloudflare this header is supplied by its edge, not by the browser.
  const address =
    (info.project.name === "chromium" ? 10 : 20) +
    (info.title.startsWith("registro") ? 1 : 2);
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": `192.0.2.${address}` });
});
function totp(secret: string) {
  let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/, ""))
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(char)
      .toString(2)
      .padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(time).digest();
  const offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
async function login(page: Page, email: string) {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(config.password);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
}
async function confirmFactor(page: Page, secret: string) {
  await page.getByLabel("Código del autenticador").fill(totp(secret));
  await page.getByRole("button", { name: "Verificar código" }).click();
}
async function mailCode(page: Page, email: string) {
  let code = "";
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          config.mailUrl + "/api/v1/messages",
        );
        const list = await response.json();
        const message = list.messages?.find((m: any) =>
          m.To?.some((to: any) => to.Address === email),
        );
        if (!message) return false;
        const detail = await (
          await page.request.get(
            config.mailUrl + "/api/v1/message/" + message.ID,
          )
        ).json();
        const match = (detail.HTML || detail.Text || "").match(/\b[0-9]{6}\b/);
        if (!match) return false;
        code = match[0];
        return true;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  return code;
}
test("registro con correo local, 2FA, puntos y canje con permisos reales", async ({
  page,
  browser,
}, info) => {
  const email = `customer-${info.project.name}@pit.test`,
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Registrarse", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Cliente del club");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(config.password);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "código de verificación",
  );
  await page
    .getByLabel("Código recibido por correo")
    .fill(await mailCode(page, email));
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page.locator(".points-value")).toHaveText("2.000pts");
  const welcomeMember = await (await page.request.get("/api/me")).json();
  expect(welcomeMember.welcomeReward.points).toBe(2000);
  expect(welcomeMember.entries).toEqual([]);
  expect(welcomeMember.quarterSpend).toBe(0);
  await page.getByRole("button", { name: "Mi actividad", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Recompensa de bienvenida" }),
  ).toContainText("+2.000 pts");
  await page.getByRole("button", { name: "Mi perfil", exact: true }).click();
  await page.getByLabel("Tipo de vehículo").selectOption("motorcycle");
  await page.getByLabel("Marca y modelo").fill("Yamaha de prueba");
  await page.getByRole("button", { name: "Añadir vehículo" }).click();
  await expect(
    page.getByText("Yamaha de prueba", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verificación en dos pasos" }).click();
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  const customerSecret = await page
    .getByLabel("Clave del autenticador")
    .inputValue();
  await confirmFactor(page, customerSecret);
  await expect(page.locator("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await login(page, email);
  await expect(
    page.getByRole("heading", { name: "Confirma que eres tú." }),
  ).toBeVisible();
  const forbidden = await page.request.get("/api/me");
  expect(forbidden.status()).toBe(403);
  await confirmFactor(page, customerSecret);
  await expect(page.locator(".points-value")).toHaveText("2.000pts");
  expect(
    (await (await page.request.get("/api/me")).json()).welcomeReward,
  ).toEqual(welcomeMember.welcomeReward);
  const staff = createClient(config.apiUrl, config.anonKey, {
    auth: { persistSession: false },
  });
  const signedIn = await staff.auth.signInWithPassword({
    email: `admin-${info.project.name}@pit.test`,
    password: config.password,
  });
  expect(signedIn.error).toBeNull();
  expect(
    (await staff.rpc("pit_admin_customers", { p_search: "" })).error,
  ).toBeTruthy();
  const enrollment = await staff.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Disposable test factor",
  });
  expect(enrollment.error).toBeNull();
  if (!enrollment.data) throw new Error("Missing local fixture factor");
  const verified = await staff.auth.mfa.challengeAndVerify({
    factorId: enrollment.data.id,
    code: totp(enrollment.data.totp.secret),
  });
  expect(verified.error).toBeNull();
  // Test-only secret, never uploaded as an artifact or committed.
  writeFileSync(
    `.local/admin-test-factor-${info.project.name}.txt`,
    enrollment.data.totp.secret,
    { mode: 0o600 },
  );
  const member = await (await page.request.get("/api/me")).json();
  const service = {
    p_id: randomUUID(),
    p_customer: member.customer.id,
    p_vehicle: member.vehicles[0].id,
    p_service: "Detailing integral",
    p_cents: 25000,
    p_mode: "En local",
  };
  const added = await staff.rpc("pit_add_service", service);
  expect(added.error).toBeNull();
  await page.getByRole("button", { name: "Actualizar saldo" }).click();
  await expect(page.locator(".points-value")).toHaveText("252.000pts");
  await expect(page.getByLabel("Puntos recibidos")).toContainText(
    "+250.000 puntos",
  );
  await page.getByRole("button", { name: "Beneficios", exact: true }).click();
  await page
    .locator(".offer-card")
    .filter({ hasText: "Cuida tu motor" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Generar código de canje" }).click();
  const code = await page.locator(".redemption-code").textContent();
  const redeemed = await staff.rpc("pit_redeem", {
    p_customer: member.customer.id,
    p_code: code,
    p_conditions: true,
  });
  expect(redeemed.error).toBeNull();
  await page.getByRole("button", { name: "Comprobar canje" }).click();
  await expect(
    page.getByText("Código utilizado", { exact: true }),
  ).toBeVisible();
  await page.goto("/#home");
  await page.reload();
  await expect(page.locator(".points-value")).toHaveText("152.000pts");
  const entry = {
    ...service,
    p_id: randomUUID(),
    p_service: "Lavado de moto",
    p_cents: 500,
  };
  const duplicates = await Promise.all([
    staff.rpc("pit_add_service", entry),
    staff.rpc("pit_add_service", entry),
  ]);
  expect(duplicates.map((r) => r.error)).toEqual([null, null]);
  expect((await (await page.request.get("/api/me")).json()).points).toBe(
    157000,
  );
  const reversal = {
    p_id: entry.p_id,
    p_reason: "Servicio duplicado en la factura",
  };
  const reversals = await Promise.all([
    staff.rpc("pit_void_service", reversal),
    staff.rpc("pit_void_service", reversal),
  ]);
  expect(reversals.map((r) => r.error)).toEqual([null, null]);
  expect((await (await page.request.get("/api/me")).json()).points).toBe(
    152000,
  );
  await staff.auth.signOut();
  expect((await page.request.get("/api/admin/customers")).status()).toBe(404);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "pit-client",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "access_token",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: `test-results/cloud-client-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("recuperación de contraseña utiliza correo, permite el nuevo acceso y revoca sesiones anteriores", async ({
  page,
  browser,
}, info) => {
  const email = `recovery-${info.project.name}@pit.test`,
    newPassword = "A-new-test-password-2026!";
  const previous = await browser.newContext();
  const previousPage = await previous.newPage();
  try {
    await previousPage.goto("http://127.0.0.1:8787");
    await login(previousPage, email);
    await expect(previousPage.locator(".points-value")).toHaveText("2.000pts");
    await page.goto("/");
    await page
      .getByRole("button", { name: "He olvidado mi contraseña" })
      .click();
    await page.getByLabel("Correo electrónico").fill(email);
    const recoveryResponse = page.waitForResponse((r) =>
      r.url().endsWith("/api/auth/forgot"),
    );
    await page.getByRole("button", { name: "Enviar código" }).click();
    expect((await recoveryResponse).status()).toBe(202);
    await expect(page.getByRole("status")).toContainText("recuperar");
    await page
      .getByLabel("Código recibido por correo")
      .fill(await mailCode(page, email));
    await page.getByRole("button", { name: "Confirmar código" }).click();
    await expect(
      page.getByRole("heading", { name: "Elige una nueva contraseña" }),
    ).toBeVisible();
    await page
      .getByLabel("Nueva contraseña", { exact: true })
      .fill(newPassword);
    await page.getByLabel("Repite la nueva contraseña").fill(newPassword);
    await page
      .getByRole("button", { name: "Guardar y cerrar sesiones" })
      .click();
    await expect(
      page.getByRole("button", { name: "Continuar", exact: true }),
    ).toBeVisible();
    const revoked = await previousPage.request.get(
      "http://127.0.0.1:8787/api/me",
    );
    expect([401, 403]).toContain(revoked.status());
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page.locator(".points-value")).toHaveText("2.000pts");
  } finally {
    await previous.close();
  }
});
