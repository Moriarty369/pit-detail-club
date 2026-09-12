import { test, expect } from "@playwright/test";

for (const purpose of ["email", "recovery"]) {
  test(`email code form preserves eight digits for ${purpose}`, async ({
    page,
  }) => {
    const submitted: unknown[] = [];
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config") {
        await route.fulfill({
          json: {
            portal: "customer",
            emailEnabled: true,
            googleEnabled: true,
            captchaSiteKey: null,
          },
        });
      } else if (path === "/api/auth/verify-email") {
        submitted.push(route.request().postDataJSON());
        // Provider rejection must leave the user at verification, with the full code intact.
        await route.fulfill({
          status: 401,
          json: { error: "Código no válido o caducado." },
        });
      } else {
        await route.fulfill({ status: 401, json: { error: "Inicia sesión." } });
      }
    });
    await page.goto(
      purpose === "recovery" ? "/#recover-code" : "/#confirm-email",
    );
    await page.getByLabel("Correo electrónico").fill("fixture@example.test");
    const input = page.getByLabel("Código recibido por correo");
    await input.pressSequentially("01234567");
    await expect(input).toHaveValue("01234567");
    await page.getByRole("button", { name: "Confirmar código" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Código no válido o caducado.",
    );
    expect(submitted).toEqual([
      { email: "fixture@example.test", token: "01234567", purpose },
    ]);
    await expect(input).toHaveValue("01234567");
    // Native form validation must block malformed input before calling the API.
    await input.fill("12345");
    await page.getByRole("button", { name: "Confirmar código" }).click();
    expect(submitted).toHaveLength(1);
  });
}
