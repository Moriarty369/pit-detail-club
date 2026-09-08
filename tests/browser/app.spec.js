import { test, expect } from '@playwright/test';
async function confirmDemoCode(page) {
  const code = await page.locator('#demo-auth-code').textContent();
  await page.getByLabel('Código de prueba', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirmar código y entrar' }).click();
}
async function login(page, email = 'alex@example.com') {
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await confirmDemoCode(page);
}

async function expectBalance(page, points) {
  await expect(page.locator('.loyalty-card .points-value')).toHaveText(`${points}pts`);
  await page.getByRole('button', { name: 'Beneficios', exact: true }).click();
  await expect(page.getByText(`Tienes ${points} puntos para seguir cuidando tu vehículo.`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mi club', exact: true }).click();
}

test('el cliente no tiene rutas ni controles administrativos', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#admin'); await login(page);
  await expectBalance(page, '65.000');
  await page.goto('/#admin');
  await expect(page.locator('.loyalty-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Panel del negocio' })).toHaveCount(0);
  await expect(page.locator('#service-form, #redeem-form, #rules-form')).toHaveCount(0);
  await expect(page.locator('.nav-item')).toHaveCount(4);
  await page.reload(); await expectBalance(page, '65.000');
  expect(errors).toEqual([]);
});
test('registro simulado, filtros y perfil sin inyección HTML', async ({ page }) => {
  await page.goto('/#profile');
  await page.getByRole('button', { name: 'Registrarse', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('<b>Andrea</b>');
  await page.getByLabel('Correo electrónico').fill('andrea@example.com');
  await page.getByRole('button', { name: 'Crear cuenta de prueba' }).click();
  await confirmDemoCode(page);
  await expect(page.locator('h1')).toContainText('<b>Andrea</b>');
  await expect(page.locator('h1 b')).toHaveCount(0);
  await expectBalance(page, '65.000');
  await page.getByRole('button', { name: 'Mis servicios', exact: true }).click();
  await page.getByRole('button', { name: 'A domicilio', exact: true }).click();
  await expect(page.getByText('Todavía no hay servicios en esta categoría.')).toBeVisible();
});
test('QR de identificación del cliente y franjas de marca', async ({ page }) => {
  await page.goto('/');
  await login(page);
  await expect(page.locator('.loyalty-card .card-top .member-stripes span')).toHaveCount(3);
  await expect(page.locator('.loyalty-card img')).toHaveCount(0);
  await expect(page.locator('.loyalty-card .points-value')).toHaveText('65.000pts');
  await page.getByRole('button', { name: 'Mi tarjeta', exact: true }).click();
  await expect(page.locator('#large-qr')).toBeVisible();
  expect(await page.locator('#large-qr').evaluate(c => new Set(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).size)).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Cerrar ventana' }).click();

});
test('pantallas móvil sin desbordamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await login(page);
  for (const route of ['home', 'rewards', 'history', 'profile', 'admin']) {
    await page.goto(`/#${route}`);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.goto('/');
  await page.screenshot({ path: 'test-results/pit-detail-mobile.png', fullPage: true });
});

test('el QR exige acceso, una ruta directa no lo evita y cerrar sesión conserva la cuenta', async ({ page }) => {
  await page.goto('/#admin');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.locator('#service-form')).toHaveCount(0);
  await login(page);
  await expectBalance(page, '65.000');
  await expect(page.locator('.stat-number').first()).toHaveText('01');
  await page.reload();
  await expectBalance(page, '65.000');
  await page.getByRole('button', { name: 'Mi perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.goto('/#history');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.locator('.service-row')).toHaveCount(0);
  await login(page);
  await expect(page.locator('.stat-number').first()).toHaveText('01');
});
test('pantallas de acceso y código son legibles en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Registrarse', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('María Demo');
  await page.getByLabel('Correo electrónico').fill('maria@example.com');
  await page.getByRole('button', { name: 'Crear cuenta de prueba' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const code = await page.locator('#demo-auth-code').textContent();
  await page.getByLabel('Código de prueba', { exact: true }).fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Confirmar código y entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('no coincide');
  await confirmDemoCode(page);
  await expect(page.getByRole('heading', { name: 'Hola, María.' })).toBeVisible();
});

test('registro del cliente no permite asignarse importes ni servicios', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#login');
  await page.getByRole('button', { name: 'Registrarse', exact: true }).click();
  await expect(page.getByLabel('Servicio realizado')).toHaveCount(0);
  await expect(page.getByLabel('Importe del primer servicio')).toHaveCount(0);
  await page.getByLabel('Nombre', { exact: true }).fill('Cliente Demo');
  await page.getByLabel('Correo electrónico').fill('cliente@example.com');
  await page.getByRole('button', { name: 'Crear cuenta de prueba' }).click();
  await confirmDemoCode(page);
  await expectBalance(page, '65.000');
  await page.reload(); await expectBalance(page, '65.000');
  await expect(page.locator('.stat-number').first()).toHaveText('01');
});
