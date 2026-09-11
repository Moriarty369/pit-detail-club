# Despliegue gratuito y operación

## Coste inicial

| Servicio            | Plan previsto                           | Límites que vigilar                                                                                                            |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare Workers  | Free, subdominio `workers.dev` y HTTPS  | 100.000 peticiones dinámicas/día, 10 ms CPU/petición. La espera de red no es CPU.                                              |
| Supabase            | Free                                    | Base de 500 MB, 50.000 usuarios activos/mes, 5 GB de salida. Puede pausarse por inactividad; sin copias automáticas incluidas. |
| Segundo factor      | TOTP de Supabase                        | Aplicación autenticadora, sin coste de SMS.                                                                                    |
| Acceso Google       | OAuth para el piloto sin dominio propio | Requiere configurar proveedor y consentimiento; durante pruebas, usuarios permitidos.                                          |
| Correo y contraseña | SMTP externo                            | Resend Free: 3.000 correos/mes, 100/día, con dominio verificado. El dominio puede tener coste.                                 |

Fuentes oficiales, revisadas el 9 de septiembre de 2026: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [Supabase](https://supabase.com/pricing), [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend](https://resend.com/pricing). Medir CPU y consumo antes de ampliar el piloto. No activar planes de pago automáticamente.

## Cuentas y autenticación

### Estado del piloto (11 de septiembre de 2026)

- Proyecto Supabase Free `pit-detail-club` creado, migración aplicada y permisos anónimos comprobados.
- Cliente publicado en `https://pit-detail-club.pit-detail.workers.dev` desde la revisión `592ccf5`. Versión inicial del Worker: `97bd6804-61dd-4108-98bd-d2f8bbf9aec1`.
- Site URL y callbacks de Supabase configurados para ese origen y para los dos portales locales.
- Secretos de Supabase y sesión guardados en el entorno `production` de GitHub con autorización del propietario. Variables de proyecto, cuenta Cloudflare y origen configuradas.
- Google OAuth configurado en Supabase, registro habilitado y acceso por correo/contraseña desactivado. El secreto de Google permanece en Supabase; los indicadores de despliegue y de los portales locales están actualizados.
- Comprobados el endpoint de configuración, rechazo de sesión anónima, inicio OAuth con cookie HttpOnly y redirección a Google. Pantalla móvil revisada en Chromium, sin errores JavaScript ni desbordamiento horizontal. QR disponible en `dist-cloud/qr-club.png` y enlace en `dist-cloud/enlace-club.txt`.
- Pendiente completar el inicio de sesión con una cuenta Google real y comprobar TOTP antes de sustituir el enlace anterior. La automatización de GitHub requiere además su token de despliegue de Cloudflare; la primera publicación utilizó la sesión OAuth local autorizada.
- El enlace y QR de GitHub Pages siguen abriendo la beta anterior.

Conectar las cuentas del negocio sin compartir contraseñas por chat:

```sh
npx wrangler login
npx supabase login
```

Crear un proyecto **Free** dedicado en Supabase, guardar su contraseña en el gestor del negocio y escoger la región disponible más cercana a los clientes. No importar saldos ficticios. Elegir el subdominio gratuito de Cloudflare: `https://pit-detail-club.SUBDOMINIO.workers.dev` será `APP_ORIGIN`, sin barra final.

Configurar Supabase Auth:

- Site URL: `APP_ORIGIN`. Redirect URLs exactas: `APP_ORIGIN/api/auth/callback` y `APP_ORIGIN/api/auth/recovery`. Añadir las del administrador cuando se defina su acceso privado.
- Contraseña mínima de 12 caracteres, confirmación de correo obligatoria, rotación de refresh tokens y registro/verificación TOTP habilitados. JWT de 15 minutos recomendado.
- Correo: configurar SMTP de un dominio verificado y probar confirmación/recuperación con una cuenta ajena al equipo del proyecto. El SMTP de demostración de Supabase no sirve para clientes.
- Google: configurar proveedor, credenciales y callback de Supabase en Google Cloud. [Guía oficial](https://supabase.com/docs/guides/auth/social-login/auth-google). El secreto OAuth permanece en Supabase.
- Si se habilita CAPTCHA, configurar Turnstile en Supabase y la clave pública en `TURNSTILE_SITE_KEY`; la privada permanece en Supabase.

`supabase/config.toml` configura las pruebas locales, no los proveedores del proyecto alojado. La publicación verifica los ajustes principales y aborta si no hay método de acceso habilitado. Hace falta comprobar también el recorrido con una cuenta real.

Durante la preparación inicial, mantener el registro cerrado en Supabase. Tras configurar Google o SMTP y los orígenes definitivos, habilitarlo; el script de publicación comprueba también este ajuste. Los callbacks locales sirven para revisar la app desde el equipo autorizado y deben revisarse al preparar el acceso público.

### Google para el piloto

El propietario ha elegido Google como primer método de acceso. El botón existente sirve tanto para crear la cuenta como para volver a entrar. Las cuentas nuevas reciben 2.000 puntos de bienvenida una sola vez; después suman puntos por servicios registrados desde administración.

En [Google Auth Platform](https://console.cloud.google.com/auth/overview), crear o seleccionar el proyecto del negocio y configurar el nombre `PIT DETAIL Club`, correo de soporte del propietario y público externo. Para el piloto en modo de pruebas, añadir las cuentas Google de los participantes en Audience. Limitar los permisos a `openid`, `userinfo.email` y `userinfo.profile`.

Crear un cliente OAuth de tipo **Aplicación web** con:

| Campo | Valor |
| --- | --- |
| Nombre | `PIT DETAIL Club` |
| Origen JavaScript | `https://pit-detail-club.pit-detail.workers.dev` |
| URI de redirección | `https://tbudcwwvkfdeziukmydq.supabase.co/auth/v1/callback` |

Descargar el JSON del cliente y tratarlo como credencial privada; no añadirlo al repositorio ni pegarlo en comentarios. Su `client_id` y `client_secret` se configuran en el proveedor Google del proyecto Supabase. No se necesita el secreto Google en React, Cloudflare ni GitHub.

Una vez configurado, verificar el proveedor, habilitar el registro en Supabase y establecer `GOOGLE_ENABLED=true`, `EMAIL_ENABLED=false` en el entorno de despliegue y en los portales locales. Publicar el cliente y comprobar con una cuenta real la vuelta desde Google, el alta con 2.000 puntos, el cierre de sesión y TOTP. Volver a entrar debe conservar el mismo movimiento de bienvenida. Las pruebas automatizadas cubren los controles del flujo OAuth; no sustituyen esta comprobación del proveedor real.

## Publicación desde GitHub

Crear el entorno `production` en el repositorio y configurar sus secretos mediante la interfaz segura:

| Secreto                 | Contenido                                                       |
| ----------------------- | --------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Token limitado al despliegue de Workers de la cuenta.           |
| `SUPABASE_ACCESS_TOKEN` | Acceso para vincular y verificar el proyecto.                   |
| `SUPABASE_DB_PASSWORD`  | Contraseña de la base.                                          |
| `SUPABASE_ANON_KEY`     | Clave `anon` o `sb_publishable_…`, nunca `service_role`.        |
| `COOKIE_SECRET`         | Al menos 32 caracteres aleatorios; conservar entre despliegues. |

Variables: `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `APP_ORIGIN`, `EMAIL_ENABLED`, `GOOGLE_ENABLED` y, opcionalmente, `TURNSTILE_SITE_KEY`. Los indicadores de acceso son `true`/`false`.

Ejecutar **Deploy customer MVP to Cloudflare Free** desde `main`, después de integrar la revisión probada de `develop`. El trabajo de publicación no se ejecuta para otras ramas. Ejecuta las pruebas, aplica migraciones, comprueba Auth y permisos anónimos, y publica exclusivamente el cliente. Su artefacto `acceso-club` contiene el QR y enlace. Las claves se cargan con la misma versión del Worker y no aparecen en React.

Comprobar registro/acceso, correo si está habilitado, TOTP, saldo, servicio y canje. Medir errores y CPU. Entonces cambiar GitHub Pages para redirigir al origen nuevo y conservar el QR existente. Ese cambio queda pendiente del despliegue real.

## Administración independiente

El cliente no contiene interfaz administrativa; su API rechaza esas rutas. PostgreSQL exige rol administrativo y `aal2`. El repositorio es público: los permisos protegen los datos.

El primer piloto puede usar administración en el equipo autorizado contra la base remota. Crear `cloud/admin/.dev.vars` privado con URL y clave pública Supabase, `COOKIE_SECRET` propio, `APP_ORIGIN="http://127.0.0.1:8788"`, `PORTAL="admin"` y métodos de acceso habilitados. Añadir los callbacks locales exactos en Supabase. Ejecutar `npm run build:cloud:admin` y `npm run dev:cloud:admin`; escucha solo en loopback y usa el mismo PostgreSQL que los clientes.

Crear la cuenta verificada del administrador y asignar el rol desde el SQL Editor, nunca desde el registro público:

```sql
-- Sustituir por el UUID de la cuenta verificada del administrador.
update private.roles set role = 'admin'
where user_id = 'UUID_DE_LA_CUENTA'::uuid;
```

Entrar por el panel y completar TOTP. La cuenta administrativa deja de acceder al portal cliente; usar cuentas distintas si se necesitan ambos roles.

`cloud/admin/wrangler.jsonc` desactiva `workers.dev`. Para alojar ese portal, definir después intranet/VPN y origen HTTPS. Supabase permanece como servicio en Internet protegido por RLS/MFA; todavía no existe aislamiento de red completo para la base.

## Copias y recuperación

Instalar herramientas PostgreSQL compatibles. Configurar `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` y `PGSSLMODE=require` para producción. Usar conexión directa o pooler de sesión. Conservar `PIT_BACKUP_KEY` —32 bytes aleatorios en 64 caracteres hexadecimales— en el gestor del negocio, separado de las copias.

```sh
node scripts/backup-cloud.mjs create .local/backups/FECHA.pitbackup
```

Exporta un snapshot consistente de datos de `auth`, `public` y `private`: identidades, factores, sesiones, roles, vehículos, servicios, movimientos, canjes y auditoría. Cifra con AES-256-GCM y no sobrescribe copias existentes. Mantener también las migraciones de Git y un respaldo seguro de configuración y secretos de proveedores. Este MVP no guarda archivos de clientes en Storage.

Propuesta inicial: copia diaria y antes de migraciones, 7 diarias y 4 semanales en almacenamiento privado. **Queda asignar responsable o ejecutor privado**; el plan gratuito no programa las copias por sí solo. No publicar volcados, claves ni trazas de autenticación.

La restauración automática admite únicamente una base local vacía con las mismas migraciones:

```sh
# PG* apuntan a Supabase local, nunca a producción.
export PIT_RESTORE_CONFIRM=EMPTY_LOCAL_DATABASE
node scripts/backup-cloud.mjs restore-local .local/backups/FECHA.pitbackup
```

Verifica integridad antes de tocar PostgreSQL y restaura en una transacción. CI compara registros y puntos, y comprueba que la cuenta restaurada conserva el segundo factor y sigue sin acceder como administrador hasta completarlo. En un desastre real, recuperar primero en un proyecto nuevo compatible, validar y revocar sesiones antiguas antes del cambio. [Referencia oficial](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

La recuperación de un autenticador perdido requiere que un propietario compruebe la identidad, retire solo ese factor en Supabase, revoque sesiones y documente la intervención. No desactivar globalmente MFA ni cambiar roles para saltarlo. Todavía no se generan códigos de recuperación individuales.

## Decisiones pendientes del negocio

Identidad y contacto del responsable, texto de privacidad/retención, condiciones de las promociones y responsable de copias/recuperación. Las ofertas son hipótesis comerciales: el MVP registra elegibilidad y confirmación del empleado; no cobra ni emite facturas. Las flotas pueden registrar varios vehículos en una cuenta, sin compartir saldos entre cuentas.

Revertir interfaz mediante una versión anterior del Worker. Para cambios de datos, usar migración correctiva o recuperación verificada; no borrar tablas. Mantener API y esquema compatibles durante la transición.
