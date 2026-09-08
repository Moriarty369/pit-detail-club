import { test, expect } from '@playwright/test';

test('Pages: recupera una descarga interrumpida en la misma pestaña y permite entrar', async ({ page }) => {
  await page.route('**/assets/main-*.js', route => route.abort());
  await page.goto('/pit-detail-club/#login');
  await expect(page.getByRole('heading', { name: 'No se pudo abrir el club.' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('pit-recovery-check', 'conservar'));
  await page.unroute('**/assets/main-*.js');
  await page.getByRole('link', { name: 'Volver a intentar' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pit-recovery-check'))).toBe('conservar');
  expect(new URL(page.url()).pathname).toBe('/pit-detail-club/');
  expect(new URL(page.url()).hash).toBe('#login');
  await page.getByLabel('Correo electrónico').fill('alex@example.com');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const code = await page.locator('#demo-auth-code').textContent();
  await page.getByLabel('Código de prueba', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirmar código y entrar' }).click();
  await expect(page.locator('.loyalty-card')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
