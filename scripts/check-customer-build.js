import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]); }
for (const dir of process.argv.slice(2).length ? process.argv.slice(2) : ['dist', 'dist-customer']) {
  for (const file of files(dir)) {
    if (/\.(js|html)$/.test(file)) {
      const source = readFileSync(file, 'utf8');
      for (const forbidden of ['Panel del negocio', 'Registrar y sumar puntos', 'Validar canje', 'Entrar a administración', '/customers', 'dist-admin', 'Selecciona un servicio y una modalidad válidos.']) {
        if (source.includes(forbidden)) throw new Error(`${file} incluye código del negocio: ${forbidden}`);
      }
    }
  }
  console.log(`${dir}: sin interfaz ni operaciones administrativas.`);
}
