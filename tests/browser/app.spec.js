import { test, expect } from '@playwright/test';
test('cliente y negocio completan un canje y un servicio con persistencia', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hola, Alex.' })).toBeVisible();
  await page.getByRole('button', { name: 'Canjear', exact: false }).click();
  await page.getByRole('button', { name: 'Generar código de canje' }).click();
  const code = await page.locator('.redemption-code').textContent();
  await page.getByRole('button', { name: 'Probar validación en el negocio' }).click();
  await page.getByLabel('He comprobado').check();
  await page.getByRole('button', { name: 'Validar canje', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText('Canje validado');
  await page.getByLabel('Código de canje').fill(code);
  await page.getByLabel('He comprobado').check();
  await page.getByRole('button', { name: 'Validar canje', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText('ya fue utilizado');
  await page.getByLabel('Importe pagado').fill('25');
  await page.getByRole('button', { name: 'Registrar y sumar puntos' }).click();
  await page.getByRole('button', { name: 'Mi club', exact: true }).click();
  await expect(page.locator('.points-value')).toContainText('500');
  await page.reload();
  await expect(page.locator('.points-value')).toContainText('500');
  expect(errors).toEqual([]);
});
test('registro simulado, filtros y perfil sin inyección HTML', async ({ page }) => {
  await page.goto('/#profile');
  await page.getByRole('button', { name: 'Probar registro' }).click();
  await page.locator('dialog').getByLabel('Nombre').fill('<b>Andrea</b>');
  await page.locator('dialog').getByLabel('Correo electrónico').fill('andrea@example.com');
  await page.getByRole('button', { name: 'Crear perfil de prueba' }).click();
  await expect(page.locator('h1')).toContainText('<b>Andrea</b>');
  await expect(page.locator('h1 b')).toHaveCount(0);
  await expect(page.locator('.points-value')).toContainText('0');
  await page.getByRole('button', { name: 'Mis servicios', exact: true }).click();
  await page.getByRole('button', { name: 'A domicilio', exact: true }).click();
  await expect(page.getByText('Todavía no hay servicios en esta categoría.')).toBeVisible();
});
test('QR de tarjeta real y QR de entrada validado', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mi tarjeta', exact: true }).click();
  await expect(page.locator('#large-qr')).toBeVisible();
  expect(await page.locator('#large-qr').evaluate(c => new Set(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).size)).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Cerrar ventana' }).click();
  await page.getByRole('button', { name: 'Panel del negocio' }).click();
  await page.getByRole('button', { name: 'QR de acceso' }).click();
  await page.getByLabel('URL accesible').fill('http://localhost:5173');
  await page.getByRole('button', { name: 'Generar QR', exact: true }).click();
  await expect(page.getByRole('status').last()).toContainText('localhost');
  await page.getByLabel('URL accesible').fill('https://example.com');
  await page.getByRole('button', { name: 'Generar QR', exact: true }).click();
  await expect(page.locator('#entry-canvas')).toBeVisible();
});
test('pantallas móvil sin desbordamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['home', 'rewards', 'history', 'profile', 'admin']) {
    await page.goto(`/#${route}`);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.goto('/');
  await page.screenshot({ path: 'test-results/pit-detail-mobile.png', fullPage: true });
});
