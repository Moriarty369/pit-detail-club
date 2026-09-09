import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
const config=JSON.parse(readFileSync('.local/cloud-test-config.json','utf8'));
function totp(secret:string){let bits='';for(const char of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(b=>parseInt(b,2)));const time=Buffer.alloc(8);time.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',key).update(time).digest();const offset=hash[19]&15;return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
async function login(page:Page,email:string){await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(config.password);await page.getByRole('button',{name:'Continuar',exact:true}).click();}
async function confirmFactor(page:Page,secret:string){await page.getByLabel('Código del autenticador').fill(totp(secret));await page.getByRole('button',{name:'Verificar código'}).click();}
async function mailLink(page:Page,email:string){
 let link='';await expect.poll(async()=>{
  const response=await page.request.get(config.mailUrl+'/api/v1/messages');const list=await response.json();
  const message=list.messages?.find((m:any)=>m.To?.some((to:any)=>to.Address===email));if(!message)return false;
  const detail=await (await page.request.get(config.mailUrl+'/api/v1/message/'+message.ID)).json();
  const match=(detail.HTML||detail.Text||'').match(/https?:[^\s"<>]+\/auth\/v1\/verify[^\s"<>]+/);if(!match)return false;link=match[0].replaceAll('&amp;','&');return true;
 },{timeout:20000}).toBe(true);return link;
}
test('registro con correo real local, 2FA, servicio y canje entre los dos portales',async({page,browser},info)=>{
 const email=`customer-${info.project.name}@pit.test`,errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/#admin');await page.getByRole('button',{name:'Registrarse',exact:true}).click();
 await page.getByLabel('Nombre',{exact:true}).fill('Cliente del club');await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(config.password);await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('enlace de verificación');
 await page.goto(await mailLink(page,email));await expect(page.locator('.points-value')).toHaveText('0pts');
 await page.getByRole('button',{name:'Mi perfil',exact:true}).click();await page.getByLabel('Tipo de vehículo').selectOption('motorcycle');await page.getByLabel('Marca y modelo').fill('Yamaha de prueba');await page.getByRole('button',{name:'Añadir vehículo'}).click();await expect(page.getByText('Yamaha de prueba',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Verificación en dos pasos'}).click();await page.getByRole('button',{name:'Configurar autenticador'}).click();const customerSecret=await page.getByLabel('Clave del autenticador').inputValue();await confirmFactor(page,customerSecret);await expect(page.locator('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await login(page,email);await expect(page.getByRole('heading',{name:'Confirma que eres tú.'})).toBeVisible();
 const forbidden=await page.request.get('/api/me');expect(forbidden.status()).toBe(403);
 await confirmFactor(page,customerSecret);await expect(page.locator('.points-value')).toHaveText('0pts');
 const context=await browser.newContext({viewport:{width:390,height:844}});const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));
 try{
  await admin.goto('http://127.0.0.1:8788');await login(admin,'admin@pit.test');
  await expect(admin.locator('.mfa-panel')).toBeVisible();
  const secretsPath='.local/admin-test-factor.txt';let adminSecret='';
  if(await admin.getByRole('button',{name:'Configurar autenticador'}).isVisible()){await admin.getByRole('button',{name:'Configurar autenticador'}).click();adminSecret=await admin.getByLabel('Clave del autenticador').inputValue();writeFileSync(secretsPath,adminSecret,{mode:0o600});}else{adminSecret=readFileSync(secretsPath,'utf8');}
  await confirmFactor(admin,adminSecret);await admin.getByLabel('Buscar cliente').fill(email);await admin.getByRole('button',{name:'Buscar',exact:true}).click();await expect(admin.locator('.customer-item')).toHaveCount(1);await admin.getByRole('button',{name:'Abrir cliente'}).click();await admin.getByLabel('Servicio',{exact:true}).selectOption('Detailing integral');await admin.getByLabel('Importe pagado (USD)').fill('250');await admin.getByRole('button',{name:'Registrar y sumar puntos'}).click();await expect(admin.getByRole('status')).toContainText('Servicio registrado');
  await page.reload();await expect(page.locator('.points-value')).toHaveText('250.000pts');await page.getByRole('button',{name:'Beneficios',exact:true}).click();await page.locator('.offer-card').filter({hasText:'Cuida tu motor'}).getByRole('button').click();await page.getByRole('button',{name:'Generar código de canje'}).click();const code=await page.locator('.redemption-code').textContent();
  await admin.getByLabel('Código de canje').fill(code!);await admin.getByLabel('He comprobado').check();await admin.getByRole('button',{name:'Validar canje',exact:true}).click();await expect(admin.getByRole('status')).toContainText('Canje validado');
  await page.goto('/#home');await page.reload();await expect(page.locator('.points-value')).toHaveText('150.000pts');
  expect((await page.request.get('/api/admin/customers')).status()).toBe(404);
  expect(await page.evaluate(()=>document.cookie)).not.toContain('pit-client');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('access_token');
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.screenshot({path:`test-results/cloud-client-${info.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
 }finally{await context.close();}
});
test('recuperación de contraseña utiliza un correo y cierra sesiones anteriores',async({page},info)=>{
 // A dedicated confirmed fixture is shared only by the first browser test here.
 test.skip(info.project.name==='webkit','El recorrido de recuperación se ejecuta una vez; el recorrido principal cubre ambos navegadores.');
 await page.goto('/');await page.getByRole('button',{name:'He olvidado mi contraseña'}).click();await page.getByLabel('Correo electrónico').fill('client@pit.test');await page.getByRole('button',{name:'Enviar enlace'}).click();await expect(page.getByRole('status')).toContainText('recuperar');await page.goto(await mailLink(page,'client@pit.test'));await expect(page.getByRole('heading',{name:'Elige una nueva contraseña'})).toBeVisible();await page.getByLabel('Nueva contraseña',{exact:true}).fill('A-new-test-password-2026!');await page.getByLabel('Repite la nueva contraseña').fill('A-new-test-password-2026!');await page.getByRole('button',{name:'Guardar y cerrar sesiones'}).click();await expect(page.getByRole('button',{name:'Continuar',exact:true})).toBeVisible();
});
