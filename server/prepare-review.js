import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { openStore } from './store.js';
import { hashPassword } from './security.js';
import { addService } from '../src/domain.js';
if (process.env.NODE_ENV === 'production') throw new Error('Las cuentas de revisión solo se crean fuera de producción.');
const filename = resolve('.local/review.sqlite'), accessFile = resolve('.local/review-access.txt');
if (existsSync(filename)) {
  if (!existsSync(accessFile)) throw new Error('Ya existe la base de revisión. No se cambiarán sus credenciales.');
  console.log('Prueba existente conservada. Credenciales en .local/review-access.txt');
} else {
  const store = openStore(filename), adminPassword = randomBytes(18).toString('base64url'), customerPassword = randomBytes(18).toString('base64url');
  try {
    const adminHash = await hashPassword(adminPassword), customerHash = await hashPassword(customerPassword);
    store.transaction(() => {
      const admin = store.addUser({ name: 'Administrador de prueba', email: 'admin@pit.example', role: 'admin', passwordHash: adminHash });
      const customer = store.addUser({ name: 'Alex Demo', email: 'alex@pit.example', passwordHash: customerHash });
      store.audit(admin.id, 'admin.bootstrap', null);
      const service = { id: randomUUID(), service: 'Detailing exterior', cents: 6500, mode: 'En local' };
      store.saveMember(addService(store.member(customer.id), service));
      store.audit(admin.id, 'service.create', customer.id, { serviceId: service.id, cents: service.cents });
    });
    writeFileSync(accessFile, `PIT DETAIL — SOLO PRUEBA LOCAL\n\nAdministración: http://127.0.0.1:3002\nCorreo: admin@pit.example\nContraseña: ${adminPassword}\n\nCliente: http://127.0.0.1:3001\nCorreo: alex@pit.example\nContraseña: ${customerPassword}\n\nBase independiente: .local/review.sqlite\nNo utilizar estas cuentas para clientes reales.\n`, { mode: 0o600, flag: 'wx' });
    console.log('Prueba preparada. Credenciales privadas en .local/review-access.txt');
  } finally { store.close(); }
}
