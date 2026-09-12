# PIT DETAIL Club

Aplicación de fidelización para clientes de detailing, motos y embarcaciones. React y TypeScript, API Hono sobre Cloudflare Workers y Supabase Auth/PostgreSQL. Acceso: https://club.pit-detail.workers.dev

Este repositorio contiene la aplicación y API de clientes. El panel y la API administrativos se mantienen en un entorno local independiente. El cliente no puede asignar puntos, validar canjes ni consultar fichas de otras cuentas. Las operaciones de base de datos requieren rol autorizado, sesión vigente y segundo factor para administración.

## Desarrollo y comprobaciones

Node 24 y `npm ci`. Ejecuta `npm run verify:cloud`, `npm run check:cloud:isolation` y, tras instalar Playwright, `npm run test:cloud:ui`. Para desarrollar la interfaz usa `npm run dev`; la API local usa `npm run dev:cloud` y variables privadas en `.dev.vars`.

El workflow `Verify customer MVP` levanta Supabase y un buzón desechables en GitHub Actions: comprueba registro y recuperación por código, TOTP, permisos, bienvenida, abonos, canje, anulación y recuperación de una copia cifrada. No usa cuentas ni datos de producción. Las pruebas de interfaz con respuestas simuladas se ejecutan separadamente de estos recorridos reales.

## Producción

`main` identifica las entregas; el desarrollo se integra mediante ramas y PR hacia `develop`, antes de promoverlo a `main`. El despliegue del cliente es manual desde `main`, exige las comprobaciones y verifica la configuración de Auth antes de publicar. Las migraciones del entorno completo se administran de forma separada: el workflow público no modifica el esquema ni necesita la contraseña de la base.

Los secretos del entorno `production` incluyen el token de despliegue de Cloudflare, el acceso de gestión de Supabase, la clave pública de Supabase y la clave de firma de cookies. Nunca se utiliza `service_role` dentro del Worker. No guardar credenciales en el código ni publicar `.dev.vars`, `.local`, volcados o capturas con datos reales.

La bienvenida concede 2.000 puntos una sola vez. Cada dólar de servicio registrado concede 1.000 puntos; los movimientos y canjes se validan en la base, no en el almacenamiento del navegador. El código de correo verifica la dirección; TOTP es el segundo factor independiente.

Los límites de los planes gratuitos y la entrega SMTP deben revisarse antes de ampliar el piloto. El número de cuentas por sí solo no garantiza capacidad. Las copias de producción se mantienen cifradas fuera de este repositorio público.
