import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { z, ZodError } from 'zod';
import { loginInput, registerInput, profileInput, vehicleInput, serviceInput, rulesInput, factorInput, email, password, type SessionInfo } from '../shared/contracts';
export type Bindings = {
  SUPABASE_URL: string; SUPABASE_ANON_KEY: string; COOKIE_SECRET: string; APP_ORIGIN: string;
  PORTAL: 'customer' | 'admin'; EMAIL_ENABLED?: string; GOOGLE_ENABLED?: string; TURNSTILE_SITE_KEY?: string;
  ASSETS?: { fetch: typeof fetch }; AUTH_LIMITER?: { limit: (arg: {key:string})=>Promise<{success:boolean}> };
};
type Env = { Bindings: Bindings; Variables: { sb: SupabaseClient; user: User; identity: SessionInfo; requestId: string } };
const fail = (status: 400|401|403|404|409|413|422|429|500|503, message: string): never => { throw new HTTPException(status, { message }); };
function check(result: {error: any}) {
  if (!result.error) return;
  const error = result.error;
  if (/^PT(?:400|403|404|409|422)$/.test(error.code || '')) throw new HTTPException(Number(error.code.slice(2)) as 400,{message:error.message});
  if (error.code === '42501') fail(403,'No tienes permiso para esta operación.');
  if (error.code === '23514' || error.code === '22P02') fail(400,'Revisa los datos introducidos.');
  if (error.status === 429) fail(429,'Demasiados intentos. Espera unos minutos.');
  if (error.status === 400 || error.status === 401 || error.status === 422) fail(401,'No se pudo completar el acceso. Comprueba tus datos y la verificación del correo.');
  fail(503,'No se pudo conectar con el servicio. Vuelve a intentarlo.');
}
async function input<T>(c: Context<Env>, schema: z.ZodType<T>): Promise<T> { let value; try {value=await c.req.json();} catch {return fail(400,'Solicitud no válida.');} return schema.parse(value); }
function client(c: Context<Env>) {
  return createServerClient(c.env.SUPABASE_URL,c.env.SUPABASE_ANON_KEY,{
    cookieOptions:{name:c.env.PORTAL==='admin'?'pit-admin':'pit-client'},
    cookies:{getAll:()=>Object.entries(getCookie(c)).map(([name,value])=>({name,value})), setAll:cookies=>{
      for(const {name,value,options} of cookies) setCookie(c,name,value,{...options,httpOnly:true,secure:new URL(c.req.url).protocol==='https:',sameSite:'Lax',path:'/'});
      c.header('Cache-Control','private, no-store');
    }},
  });
}
async function identity(sb: SupabaseClient, user: User): Promise<SessionInfo> {
  const roleResult=await sb.rpc('pit_session_role'); check(roleResult);
  if(!['customer','admin'].includes(roleResult.data)) fail(403,'Esta cuenta no tiene acceso al club.');
  const factors=await sb.auth.mfa.listFactors();check(factors);
  const assurance=await sb.auth.mfa.getAuthenticatorAssuranceLevel();check(assurance);
  const enrolled=factors.data!.totp.filter(f=>f.status==='verified');
  return {user:{id:user.id,email:user.email||'',name:String(user.user_metadata.full_name||'Cliente')},role:roleResult.data,
    mfa:{required:(roleResult.data==='admin'||enrolled.length>0)&&assurance.data!.currentLevel!=='aal2',enrolled:enrolled.length>0,currentLevel:assurance.data!.currentLevel||'aal1',factors:enrolled.map(f=>({id:f.id,friendly_name:f.friendly_name}))},member:null};
}
async function sessionResponse(c:Context<Env>) {
 const info=c.get('identity');if(!info.mfa.required&&info.role==='customer'){const result=await c.get('sb').rpc('pit_my_member');check(result);info.member=result.data;}
 return c.json(info);
}
export function createApp() {
 const app=new Hono<Env>();
 app.use('*',async(c,next)=>{
  c.set('requestId',crypto.randomUUID());
  c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','no-referrer');c.header('X-Frame-Options','DENY');
  c.header('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  c.header('Content-Security-Policy',"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(new URL(c.req.url).protocol==='https:') c.header('Strict-Transport-Security','max-age=31536000');
  if(c.req.path.startsWith('/api/')) c.header('Cache-Control','private, no-store');
  await next();
 });
 app.use('/api/*',bodyLimit({maxSize:8192,onError:c=>c.json({error:'Solicitud demasiado grande.'},413)}));
 app.get('/api/health',c=>{const ready=!!(c.env.SUPABASE_URL&&c.env.SUPABASE_ANON_KEY&&c.env.COOKIE_SECRET&&c.env.APP_ORIGIN);return c.json({ready},ready?200:503);});
 app.get('/api/config',c=>c.json({portal:c.env.PORTAL||'customer',emailEnabled:c.env.EMAIL_ENABLED==='true',googleEnabled:c.env.GOOGLE_ENABLED==='true',captchaSiteKey:c.env.TURNSTILE_SITE_KEY||null}));
 app.use('/api/*',async(c,next)=>{
  if(!c.env.SUPABASE_URL||!c.env.SUPABASE_ANON_KEY||!c.env.COOKIE_SECRET||!c.env.APP_ORIGIN) fail(503,'El club aún no tiene configurado el acceso. Vuelve a intentarlo más tarde.');
  const origin=c.req.header('Origin');
  if(origin&&origin!==c.env.APP_ORIGIN) fail(403,'Origen no permitido.');
  if(!['GET','HEAD'].includes(c.req.method)) {
   if(origin!==c.env.APP_ORIGIN||c.req.header('X-PIT-Client')!=='1'||!c.req.header('Content-Type')?.startsWith('application/json')) fail(403,'Solicitud no permitida.');
  }
  if(c.req.path.startsWith('/api/auth/')||c.req.path.startsWith('/api/mfa/')) {
   if(c.env.AUTH_LIMITER){const result=await c.env.AUTH_LIMITER.limit({key:c.req.header('CF-Connecting-IP')||'local'});if(!result.success) fail(429,'Demasiados intentos. Espera un minuto.');}
   else if(new URL(c.req.url).protocol==='https:') fail(503,'El acceso no está disponible temporalmente.');
  }
  c.set('sb',client(c));await next();
 });
 app.post('/api/auth/login',async c=>{
  if(c.env.EMAIL_ENABLED!=='true')fail(404,'Acceso por correo no disponible.');
  const data=await input(c,loginInput);const sb=c.get('sb');if(c.env.TURNSTILE_SITE_KEY&&!data.captchaToken)fail(400,'Completa la comprobación de acceso.');const result=await sb.auth.signInWithPassword({email:data.email,password:data.password,options:{captchaToken:data.captchaToken}});check(result);
  const info=await identity(sb,result.data.user!);
  if(info.role!==c.env.PORTAL){await sb.auth.signOut({scope:'local'});fail(403,'Esta cuenta pertenece al otro portal.');}
  c.set('identity',info);return sessionResponse(c);
 });
 app.post('/api/auth/register',async c=>{
  if(c.env.PORTAL!=='customer'||c.env.EMAIL_ENABLED!=='true')fail(404,'Registro no disponible.');
  const data=await input(c,registerInput);
  if(c.env.TURNSTILE_SITE_KEY&&!data.captchaToken)fail(400,'Completa la comprobación de acceso.');
  const result=await c.get('sb').auth.signUp({email:data.email,password:data.password,options:{data:{full_name:data.name,marketing:data.marketing},captchaToken:data.captchaToken,emailRedirectTo:c.env.APP_ORIGIN+'/api/auth/callback'}});check(result);
  // A configured production project must require email confirmation.
  if(result.data.session){await c.get('sb').auth.signOut({scope:'local'});fail(503,'El registro requiere configurar la verificación del correo.');}
  return c.json({message:'Si el correo puede registrarse, recibirás un enlace de verificación. Revisa también la carpeta de spam.'},202);
 });
 app.post('/api/auth/google',async c=>{
  if(c.env.GOOGLE_ENABLED!=='true')fail(404,'Acceso con Google no disponible.');
  await input(c,z.object({}).strict());
  const result=await c.get('sb').auth.signInWithOAuth({provider:'google',options:{redirectTo:c.env.APP_ORIGIN+'/api/auth/callback',skipBrowserRedirect:true}});check(result);return c.json({url:result.data.url});
 });
 app.get('/api/auth/callback',async c=>{
  const code=c.req.query('code');if(!code)return c.redirect('/?auth=failed');
  const result=await c.get('sb').auth.exchangeCodeForSession(code);
  if(result.error)return c.redirect('/?auth=failed');
  const info=await identity(c.get('sb'),result.data.user!);
  if(info.role!==c.env.PORTAL){await c.get('sb').auth.signOut({scope:'local'});return c.redirect('/?auth=wrong-portal');}
  return c.redirect('/#home');
 });
 app.post('/api/auth/forgot',async c=>{
  if(c.env.EMAIL_ENABLED!=='true')fail(404,'Acceso por correo no disponible.');
  const data=await input(c,z.object({email,captchaToken:z.string().max(2048).optional()}).strict());
  if(c.env.TURNSTILE_SITE_KEY&&!data.captchaToken)fail(400,'Completa la comprobación de acceso.');
  const result=await c.get('sb').auth.resetPasswordForEmail(data.email,{captchaToken:data.captchaToken,redirectTo:c.env.APP_ORIGIN+'/api/auth/recovery'});
  if(result.error?.status===429)check(result);
  return c.json({message:'Si la cuenta existe, recibirás un enlace para recuperar el acceso.'},202);
 });
 app.get('/api/auth/recovery',async c=>{
  const code=c.req.query('code');if(!code)return c.redirect('/?auth=failed');
  const result=await c.get('sb').auth.exchangeCodeForSession(code);if(result.error)return c.redirect('/?auth=failed');
  await setSignedCookie(c,'pit-recovery',`${result.data.user!.id}:${Date.now()+600000}`,c.env.COOKIE_SECRET,{httpOnly:true,secure:new URL(c.req.url).protocol==='https:',sameSite:'Lax',path:'/api',maxAge:600});
  return c.redirect('/#new-password');
 });
 app.post('/api/auth/logout',async c=>{
  await input(c,z.object({}).strict());const result=await c.get('sb').auth.signOut({scope:'local'});if(result.error&&![401,403,404].includes(result.error.status||0)&&result.error.name!=='AuthSessionMissingError')check(result);
  deleteCookie(c,'pit-recovery',{path:'/api'});return c.json({ok:true});
 });
 app.use('/api/*',async(c,next)=>{
  const result=await c.get('sb').auth.getUser();if(result.error||!result.data.user)fail(401,'Inicia sesión para continuar.');
  c.set('user',result.data.user!);const info=await identity(c.get('sb'),result.data.user!);
  if(info.role!==c.env.PORTAL)fail(403,'Esta cuenta pertenece al otro portal.');c.set('identity',info);await next();
 });
 app.get('/api/session',sessionResponse);
 app.post('/api/mfa/enroll',async c=>{
  await input(c,z.object({}).strict());const sb=c.get('sb'),info=c.get('identity');
  if(info.mfa.enrolled&&info.mfa.currentLevel!=='aal2')fail(403,'Confirma tu segundo factor antes de añadir otro.');
  const factors=await sb.auth.mfa.listFactors();check(factors);
  for(const factor of factors.data!.all.filter(f=>f.status==='unverified'))check(await sb.auth.mfa.unenroll({factorId:factor.id}));
  const result=await sb.auth.mfa.enroll({factorType:'totp',friendlyName:`PIT ${new Date().toISOString()}`,issuer:'PIT DETAIL'});check(result);
  return c.json({factorId:result.data!.id,secret:result.data!.totp.secret,uri:result.data!.totp.uri});
 });
 app.post('/api/mfa/verify',async c=>{
  const data=await input(c,factorInput);const result=await c.get('sb').auth.mfa.challengeAndVerify(data);check(result);
  c.set('identity',await identity(c.get('sb'),c.get('user')));return sessionResponse(c);
 });
 app.use('/api/*',async(c,next)=>{if(c.get('identity').mfa.required)fail(403,'Completa la verificación en dos pasos.');await next();});
 app.post('/api/mfa/remove',async c=>{
  const {factorId}=await input(c,z.object({factorId:z.string().uuid()}).strict());const info=c.get('identity');
  if(info.mfa.currentLevel!=='aal2')fail(403,'Confirma el segundo factor.');
  if(info.role==='admin'&&info.mfa.factors.length<=1)fail(403,'Administración necesita conservar al menos un autenticador.');
  check(await c.get('sb').auth.mfa.unenroll({factorId}));return c.json({ok:true});
 });
 app.post('/api/auth/password',async c=>{
  const data=await input(c,z.object({password,currentPassword:z.string().max(128).optional()}).strict());const sb=c.get('sb');
  const recovery=await getSignedCookie(c,c.env.COOKIE_SECRET,'pit-recovery');
  const [recoveryId,recoveryExpiry]=typeof recovery==='string'?recovery.split(':'):[];
  if(recoveryId!==c.get('user').id||Number(recoveryExpiry)<=Date.now()||!Number.isFinite(Number(recoveryExpiry))){
   if(!data.currentPassword)fail(400,'Introduce tu contraseña actual.');
   // Validate separately so reauthentication cannot downgrade the current MFA session.
   const {createClient}=await import('@supabase/supabase-js');const verifier=createClient(c.env.SUPABASE_URL,c.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
   const checked=await verifier.auth.signInWithPassword({email:c.get('user').email!,password:data.currentPassword!});check(checked);await verifier.auth.signOut({scope:'local'});
  }
  check(await sb.auth.updateUser({password:data.password}));deleteCookie(c,'pit-recovery',{path:'/api'});
  check(await sb.auth.signOut({scope:'global'}));return c.json({ok:true});
 });
 app.get('/api/me',async c=>{if(c.env.PORTAL!=='customer')fail(404,'Ruta no encontrada.');const result=await c.get('sb').rpc('pit_my_member');check(result);return c.json(result.data);});
 app.patch('/api/me',async c=>{if(c.env.PORTAL!=='customer')fail(404,'Ruta no encontrada.');const data=await input(c,profileInput);const r=await c.get('sb').rpc('pit_update_profile',{p_name:data.name,p_marketing:data.marketing});check(r);return c.json(r.data);});
 app.post('/api/me/vehicles',async c=>{if(c.env.PORTAL!=='customer')fail(404,'Ruta no encontrada.');const data=await input(c,vehicleInput);const r=await c.get('sb').rpc('pit_add_vehicle',{p_kind:data.kind,p_label:data.label});check(r);return c.json(r.data);});
 app.post('/api/me/rewards',async c=>{if(c.env.PORTAL!=='customer')fail(404,'Ruta no encontrada.');const data=await input(c,z.object({offerId:z.enum(['wash','oil','detail','rappel'])}).strict());const r=await c.get('sb').rpc('pit_request_reward',{p_offer:data.offerId});check(r);return c.json(r.data);});
 // This entire route family is absent from the public customer portal's API.
 app.use('/api/admin/*',async(c,next)=>{if(c.env.PORTAL!=='admin'||c.get('identity').role!=='admin')fail(404,'Ruta no encontrada.');await next();});
 app.get('/api/admin/customers',async c=>{const r=await c.get('sb').rpc('pit_admin_customers',{p_search:(c.req.query('search')||'').slice(0,120)});check(r);return c.json(r.data);});
 app.get('/api/admin/customers/:id',async c=>{const id=z.string().uuid().parse(c.req.param('id'));const r=await c.get('sb').rpc('pit_admin_member',{p_customer:id});check(r);return c.json(r.data);});
 app.post('/api/admin/services',async c=>{const d=await input(c,serviceInput);const r=await c.get('sb').rpc('pit_add_service',{p_id:d.id,p_customer:d.customerId,p_vehicle:d.vehicleId,p_service:d.service,p_cents:d.cents,p_mode:d.mode});check(r);return c.json(r.data);});
 app.post('/api/admin/services/:id/void',async c=>{const id=z.string().uuid().parse(c.req.param('id'));const d=await input(c,z.object({reason:z.string().trim().min(5).max(500)}).strict());const r=await c.get('sb').rpc('pit_void_service',{p_id:id,p_reason:d.reason});check(r);return c.json(r.data);});
 app.post('/api/admin/redemptions',async c=>{const d=await input(c,z.object({customerId:z.string().uuid(),code:z.string().regex(/^[a-fA-F0-9]{10}$/),conditionsConfirmed:z.literal(true)}).strict());const r=await c.get('sb').rpc('pit_redeem',{p_customer:d.customerId,p_code:d.code,p_conditions:d.conditionsConfirmed});check(r);return c.json(r.data);});
 app.get('/api/admin/rules',async c=>{const r=await c.get('sb').from('club_rules').select('threshold_cents,rappel_percent').single();check(r);return c.json({thresholdCents:r.data!.threshold_cents,rappelPercent:r.data!.rappel_percent});});
 app.patch('/api/admin/rules',async c=>{const d=await input(c,rulesInput);const r=await c.get('sb').rpc('pit_update_rules',{p_threshold:d.thresholdCents,p_percent:d.rappelPercent});check(r);return c.json(r.data);});
 app.get('/api/admin/audit',async c=>{const r=await c.get('sb').from('audit_events').select('id,actor_id,customer_id,action,details,created_at').order('created_at',{ascending:false}).limit(100);check(r);return c.json(r.data);});
 app.all('/api/*',()=>fail(404,'Ruta no encontrada.'));
 app.get('*',async c=>c.env.ASSETS?c.env.ASSETS.fetch(c.req.raw):c.text('PIT DETAIL',404));
 app.onError((error,c)=>{
  if(error instanceof ZodError)return c.json({error:error.issues[0]?.message||'Revisa los datos.'},400);
  if(error instanceof HTTPException)return c.json({error:error.message},error.status);
  // Do not log request bodies, URLs with auth codes, tokens or customer information.
  console.error(JSON.stringify({event:'request.failed',requestId:c.get('requestId'),method:c.req.method}));
  return c.json({error:'No se pudo completar la operación.',requestId:c.get('requestId')},500);
 });
 return app;
}
export default createApp();
