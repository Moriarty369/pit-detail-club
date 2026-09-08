// Only Playwright uses this disposable database and test identity.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from './store.js';
import { hashPassword } from './security.js';
import { createApp } from './http.js';
const dir = mkdtempSync(join(tmpdir(), 'pit-browser-test-')), store = openStore(join(dir, 'test.sqlite'));
store.addUser({ name: 'Admin de pruebas', email: 'admin@example.test', passwordHash: await hashPassword('Test-password-for-PIT-2026'), role: 'admin' });
const servers = ['customer', 'admin'].map((scope, index) => {
  const port = 3101 + index;
  const server = createApp({ store, scope, origins: [`http://127.0.0.1:${port}`], staticDir: resolve(`dist-${scope}`), secureCookies: false });
  server.listen(port, '127.0.0.1'); return server;
});
async function close() { await Promise.all(servers.map(s => new Promise(r => s.close(r)))); store.close(); rmSync(dir, { recursive: true, force: true }); process.exit(0); }
process.on('SIGTERM', close); process.on('SIGINT', close);
