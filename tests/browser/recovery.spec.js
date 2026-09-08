import { test, expect } from '@playwright/test';

test('almacenamiento bloqueado: permite entrar y avisa de que los datos son temporales', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    for (const key of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, key, { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    }
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.storage-notice')).toContainText('se perderán al recargar');
  await page.getByLabel('Correo electrónico').fill('alex@example.com');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const code = await page.locator('#demo-auth-code').textContent();
  await page.getByLabel('Código de prueba', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Confirmar código y entrar' }).click();
  await expect(page.locator('.loyalty-card')).toBeVisible();
  await expect(page.locator('.storage-notice')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('una descarga fallida ofrece reintento y conserva los datos guardados', async ({ page }) => {
  await page.route('**/src/main.js*', route => route.abort());
  await page.goto('/#login');
  await expect(page.getByRole('heading', { name: 'No se pudo abrir el club.' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('pit-recovery-test', 'conservar'));
  await page.unroute('**/src/main.js*');
  await page.getByRole('link', { name: 'Volver a intentar' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('abrir')).toBeTruthy();
  expect(new URL(page.url()).hash).toBe('#login');
  expect(await page.evaluate(() => localStorage.getItem('pit-recovery-test'))).toBe('conservar');
});

test('si falla incluso el cargador, el HTML mantiene una salida visible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route('**/src/boot.js*', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Abriendo tu club…' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver a intentar' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'No se pudo abrir el club.' })).toBeVisible({ timeout: 15000 });
});

test('sin JavaScript se explica cómo abrir la beta', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5173/');
    await expect(page.getByText('Activa JavaScript en tu navegador para abrir la beta.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Volver a intentar' })).toBeVisible();
  } finally { await context.close(); }
});

test('una fuente externa que no responde no bloquea el acceso', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('https://fonts.googleapis.com/**', async route => { await pending; await route.abort(); });
  try {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect(page.locator('#boot-screen')).toHaveCount(0);
  } finally { release(); }
});
