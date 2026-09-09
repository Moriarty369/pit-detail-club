// Disposable local Supabase only. This refuses remote projects.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const output=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'});
const values=Object.fromEntries([...output.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(m=>[m[1],m[2]]));
if(!values.API_URL||!['127.0.0.1','localhost'].includes(new URL(values.API_URL).hostname))throw new Error('Las pruebas requieren Supabase local.');
for(const filename of ['.dev.vars','cloud/admin/.dev.vars']) if(existsSync(filename)&&process.env.CI!=='true')throw new Error(`${filename} ya existe. Conserva tus variables antes de preparar las pruebas.`);
const sb=createClient(values.API_URL,values.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const password='PIT-local-tests-only-2026!';
for(const [email,name,role] of [['admin@pit.test','Admin pruebas','admin'],['client@pit.test','Cliente pruebas','customer']]){
 const result=await sb.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name}});
 if(result.error)throw new Error('No se pudo crear la cuenta local de pruebas: '+result.error.message);
 if(role==='admin'){
  const id=result.data.user.id;if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Identificador no válido.');
  execFileSync('psql',[values.DB_URL,'-v','ON_ERROR_STOP=1'],{input:`update private.roles set role='admin' where user_id='${id}';`,stdio:['pipe','pipe','inherit']});
 }
}
mkdirSync('.local',{recursive:true,mode:0o700});
const cookieSecret=randomBytes(32).toString('hex');
for(const [file,port,portal] of [['.dev.vars',8787,'customer'],['cloud/admin/.dev.vars',8788,'admin']])writeFileSync(file,`SUPABASE_URL=${JSON.stringify(values.API_URL)}\nSUPABASE_ANON_KEY=${JSON.stringify(values.ANON_KEY)}\nCOOKIE_SECRET=${JSON.stringify(cookieSecret)}\nAPP_ORIGIN="http://127.0.0.1:${port}"\nPORTAL="${portal}"\nEMAIL_ENABLED="true"\nGOOGLE_ENABLED="false"\n`,{mode:0o600});
writeFileSync('.local/cloud-test-config.json',JSON.stringify({apiUrl:values.API_URL,mailUrl:values.INBUCKET_URL||'http://127.0.0.1:54324',password}),{mode:0o600});
console.log('Cuentas y variables de pruebas locales preparadas.');
