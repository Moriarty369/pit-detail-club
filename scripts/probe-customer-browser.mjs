import { chromium, webkit } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync(".local/readiness-100", { recursive: true });
const origin = "https://club.pit-detail.workers.dev";
const report = {
  at: new Date().toISOString(),
  origin,
  checks: [],
  limitations:
    "Anonymous production navigation only. No forms submitted, no email sent, no real authenticated Google/Supabase session tested.",
};
for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const start = performance.now();
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByLabel("Correo electrónico").waitFor({ state: "visible" });
      const loginMs = Math.round(performance.now() - start);
      const googleVisible = await page
        .getByRole("button", { name: /Continuar con Google/ })
        .isVisible();
      const loginOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      await page
        .getByRole("button", { name: "Registrarse", exact: true })
        .click();
      await page.getByLabel("Nombre", { exact: true }).waitFor();
      const registrationOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      const marketingOptInDefault = await page
        .locator('input[name="marketing"]')
        .isChecked();
      await page.screenshot({
        path:
          ".local/readiness-100/public-register-" + name + "-" + width + ".png",
        fullPage: true,
      });
      report.checks.push({
        browser: name,
        width,
        loginMs,
        googleVisible,
        loginOverflow,
        registrationOverflow,
        marketingOptInDefault,
        errors,
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
writeFileSync(
  ".local/readiness-100/public-browser.json",
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(report));
if (
  report.checks.some(
    (c) =>
      c.errors.length ||
      c.loginOverflow ||
      c.registrationOverflow ||
      !c.googleVisible ||
      c.marketingOptInDefault,
  )
)
  process.exitCode = 1;
