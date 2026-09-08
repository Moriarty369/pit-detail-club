import { resolve } from 'node:path';
import { openStore } from './store.js';
import { createApp } from './http.js';

const production = process.env.NODE_ENV === 'production';
const publicPort = Number(process.env.PIT_CUSTOMER_PORT || 3001), adminPort = Number(process.env.PIT_ADMIN_PORT || 3002);
const customerOrigin = process.env.PIT_CUSTOMER_ORIGIN || `http://127.0.0.1:${publicPort}`;
const adminOrigin = process.env.PIT_ADMIN_ORIGIN || `http://127.0.0.1:${adminPort}`;
const app = process.env.PIT_APP || 'all';
if (!['all', 'customer', 'admin'].includes(app)) throw new Error('PIT_APP debe ser all, customer o admin.');
const configs = [
  { scope: 'customer', origin: customerOrigin, port: publicPort, host: process.env.PIT_CUSTOMER_HOST || '127.0.0.1' },
  { scope: 'admin', origin: adminOrigin, port: adminPort, host: process.env.PIT_ADMIN_HOST || '127.0.0.1' },
].filter(config => app === 'all' || config.scope === app);
if (production && !configs.every(c => c.origin.startsWith('https://'))) throw new Error('Configura orígenes HTTPS antes del despliegue.');
const store = openStore(resolve(process.env.PIT_DB || '.local/pit-detail.sqlite'));
const servers = configs.map(config => {
  const server = createApp({ store, scope: config.scope, origins: [config.origin], staticDir: resolve(`dist-${config.scope}`), secureCookies: production });
  server.listen(config.port, config.host, () => console.log(`${config.scope === 'customer' ? 'Portal de clientes' : 'Administración privada'}: ${config.origin}`));
  return server;
});
async function close() { await Promise.all(servers.map(server => new Promise(done => server.close(done)))); store.close(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
