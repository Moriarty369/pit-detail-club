import { resolve } from 'node:path';
import { openStore } from './store.js';
import { emailField, hashPassword, textField } from './security.js';

const email = emailField(process.env.PIT_ADMIN_EMAIL);
const name = textField(process.env.PIT_ADMIN_NAME || 'Administrador', 2, 70, 'el nombre');
const passwordHash = await hashPassword(process.env.PIT_ADMIN_PASSWORD);
const store = openStore(resolve(process.env.PIT_DB || '.local/pit-detail.sqlite'));
try {
  store.transaction(() => {
    const user = store.addUser({ email, name, passwordHash, role: 'admin' });
    store.audit(user.id, 'admin.bootstrap', null);
  });
  console.log('Administrador creado. No hay registro público de administradores.');
} finally { store.close(); }
