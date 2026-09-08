import QRCode from 'qrcode';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = new URL(process.argv[2]);
if (url.protocol !== 'https:' || url.username || url.password) {
  throw new Error('Use the verified public HTTPS URL, without credentials.');
}
const directory = resolve(process.argv[3] || '../compartir');
await mkdir(directory, { recursive: true });
const options = { errorCorrectionLevel: 'M', margin: 4, width: 800, color: { dark: '#000000', light: '#ffffff' } };
await QRCode.toFile(resolve(directory, 'pit-detail-beta-qr.png'), url.href, options);
await writeFile(resolve(directory, 'pit-detail-beta-qr.svg'), await QRCode.toString(url.href, { ...options, type: 'svg' }));
await writeFile(resolve(directory, 'enlace-beta.txt'), `${url.href}\n\nPIT DETAIL Club · Beta para socios\nPrueba con datos ficticios. Usa «Aportar idea» para preparar un comentario y compartirlo con el grupo.\n`);
console.log(`QR files created for ${url.href} in ${directory}`);
