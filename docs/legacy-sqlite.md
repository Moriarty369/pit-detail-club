# PIT DETAIL Club

MVP de fidelización con dos aplicaciones independientes y una API con permisos en el servidor. El portal de clientes conserva el diseño de la beta; el panel del negocio tiene su propia entrada, compilación y dirección.

| Rol | Operaciones |
| --- | --- |
| Cliente | Registrarse, iniciar sesión, consultar su tarjeta, saldo e historial, editar su perfil y solicitar códigos de beneficios. |
| Administrador | Buscar clientes, registrar servicios, confirmar canjes, ajustar el rappel, consultar actividad y generar el QR de acceso al club. |

Una cuenta de cliente no puede convertirse en administrador. No existe registro público de administradores. Conocer una URL o alterar la interfaz no concede permisos sobre la API.

## Qué está publicado

[Beta pública para socios](https://moriarty369.github.io/pit-detail-club/): únicamente el portal de clientes en modo demostración. Alex (`alex@example.com`) y las nuevas cuentas ficticias empiezan con un servicio de $65 y 65.000 puntos. Se introduce el código de prueba mostrado en pantalla; no se envía correo ni se verifica identidad. Las cuentas solo se conservan en ese navegador y pueden ser alteradas por quien lo controla. No usar datos reales.

La beta ya no contiene el panel administrativo ni controles para asignar servicios, sumar puntos o confirmar canjes. El registro tampoco permite al cliente elegir el importe de un servicio. La base de datos del MVP conectado es independiente de la demo: no se importan saldos del navegador como operaciones reales.

El QR existente sigue apuntando a la misma URL pública y solicita acceso. El QR de la tarjeta identifica al cliente; no constituye una sesión ni permite autorizar operaciones.

## Ejecutar el MVP conectado

Requisito: Node 22.13 o posterior con `node:sqlite` y npm. Se mantiene `--experimental-sqlite` por compatibilidad con el Node 23.3 del entorno de desarrollo.

```sh
npm ci
npm run build:mvp
```

Crear un administrador con variables de entorno propias. La contraseña debe tener entre 12 y 128 caracteres; no guardar credenciales en Git. Este ejemplo pide la contraseña sin mostrarla ni escribirla en el historial (bash o zsh):

```sh
export PIT_ADMIN_EMAIL='tu-correo@ejemplo.com'
export PIT_ADMIN_NAME='Tu nombre'
read -r -s PIT_ADMIN_PASSWORD
export PIT_ADMIN_PASSWORD
npm run admin:create
unset PIT_ADMIN_PASSWORD
npm run start:mvp
```

Direcciones locales:

- Clientes: http://127.0.0.1:3001
- Administración: http://127.0.0.1:3002

Registrarse en el portal de clientes crea una cuenta con saldo cero. Desde administración, buscar el correo, abrir el cliente y registrar su primer servicio. Por ejemplo, un lavado de moto de $5 suma 5.000 puntos; un detailing de $250 suma 250.000. El importe lo introduce exclusivamente el administrador. El cliente ve el saldo actualizado al recargar y mediante comprobaciones periódicas cuando no está editando un formulario.

El cliente solicita un código de beneficio. El administrador comprueba sus condiciones y lo confirma desde su portal. Los puntos se descuentan al confirmar; solicitar un código no los descuenta. El registro del servicio usa una referencia para que reenviar la misma solicitud no duplique los puntos.

SQLite conserva cuentas, sesiones, servicios, canjes, reglas y actividad en `.local/pit-detail.sqlite`. Para elegir otro archivo, definir `PIT_DB` tanto al crear el administrador como al iniciar el servidor. El directorio `.local`, bases de datos y archivos `.env` están excluidos de Git. No publicar esos archivos.

### Prueba local con datos ficticios

```sh
npm run demo:prepare
npm run demo:mvp
```

Genera una base separada `.local/review.sqlite`, dos cuentas con contraseñas aleatorias y el archivo privado `.local/review-access.txt` con las credenciales. El cliente de ejemplo tiene su primer servicio de $65 registrado por el administrador. Ejecutarlo de nuevo conserva la base y las cuentas existentes. Nunca emplear esta base para el negocio real.

## Separación y futuro despliegue en intranet

| Pieza | Código | Compilación | Puerto local |
| --- | --- | --- | --- |
| Portal QR de clientes | `src/main.js`, `src/customer-portal.js` | `dist-customer` | 3001 |
| Administración | `admin/` | `dist-admin` | 3002 |
| API y persistencia | `server/` | Node, no es un sitio estático | Dos listeners con rutas y sesiones distintas |
| Demo pública aislada | Adaptador de demostración | `dist` | GitHub Pages |

La API de clientes solo expone su cuenta autenticada mediante `/api/me`; no acepta identificadores ajenos para consultar perfiles. Las rutas administrativas solo existen en el listener administrativo y exigen el rol `admin`. Cada portal usa su propia cookie de sesión.

Para la futura intranet, el proxy público debe dirigirse exclusivamente al listener de clientes. El listener administrativo y `dist-admin` deben quedar en la red privada/VPN, con su proxy HTTPS propio. Ambos acceden al mismo servidor de aplicación y base de datos; no se debe copiar SQLite a dos máquinas y esperar sincronización. Se puede iniciar un único listener con `PIT_APP=customer` o `PIT_APP=admin`; dos procesos en el mismo host pueden usar el mismo archivo SQLite. No colocar SQLite en un sistema de archivos de red.

Configuración disponible: `PIT_DB`, `PIT_APP` (`all`, `customer`, `admin`), `PIT_CUSTOMER_HOST`, `PIT_ADMIN_HOST`, `PIT_CUSTOMER_PORT`, `PIT_ADMIN_PORT`, `PIT_CUSTOMER_ORIGIN` y `PIT_ADMIN_ORIGIN`. Por defecto, ambos listeners solo escuchan en `127.0.0.1`. En producción, usar `NODE_ENV=production` y orígenes HTTPS exactos. El proxy debe preservar `Origin`; la API exige origen permitido y una cabecera propia para las mutaciones. No existe CORS abierto. Los límites por dirección usan la IP del socket; detrás de un proxy se comparten, por lo que deben configurarse también límites en el proxy antes del piloto.

GitHub Pages publica archivos estáticos. La versión conectada necesita alojamiento para Node y almacenamiento persistente; todavía no se ha desplegado una API pública ni una intranet. El workflow compila ambas aplicaciones, comprueba que los paquetes de clientes no incluyen operaciones administrativas y publica **solo `dist`**. `dist-admin`, `dist-customer` y `server/` no se suben al sitio Pages.

El código fuente está en un repositorio público. La separación protege datos y operaciones mediante permisos de servidor, no mediante secreto del código.

## Reglas actuales

- USD, sin conversión a bolívares ni integración de cobros.
- 1.000 puntos por $1 elegible; cada céntimo suma 10 puntos. Registrar importes de $5 a $250, sin desplazamiento.
- Ofertas por 100.000, 150.000 y 250.000 puntos, con condiciones visibles.
- Rappel inicial: $250 en el trimestre desbloquean 5% sobre mano de obra de un próximo servicio, una vez por trimestre. Zona `America/Caracas`.
- Códigos de cinco minutos. Se revalidan el saldo, las condiciones y el estado al confirmarlos. Las reglas globales no se pueden cambiar mientras existan códigos vigentes.
- El historial de actividad identifica al actor de servicios, canjes y cambios de reglas. No se permite borrar o editar servicios desde la UI.

Las promociones siguen siendo hipótesis de producto, pendientes de aprobación comercial. El sistema registra la comprobación del administrador; no aplica descuentos a una factura.

## Estado del acceso y próximos incrementos

El MVP conectado guarda hashes scrypt con sal aleatoria; no guarda contraseñas en el navegador. Las sesiones son tokens aleatorios almacenados como hashes en el servidor, duran dos horas y se revocan al cerrar sesión. Las cookies son `HttpOnly`, `SameSite=Strict` y `Secure` en producción. Hay límites de intentos, validación de campos, autorización por rol y transacciones SQLite para modificar servicios y canjes.

Antes de incorporar clientes reales quedan: verificación de correo y recuperación de cuenta, MFA de administradores, anulaciones/devoluciones auditadas, copias de seguridad y prueba de restauración, condiciones comerciales y de privacidad, configuración del alojamiento HTTPS y pruebas de carga. El registro actual autentica por contraseña, pero todavía no demuestra la propiedad del correo.

Referencias de las decisiones de implementación: [SQLite en Node](https://nodejs.org/api/sqlite.html), [almacenamiento de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) y [protección CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Verificación

```sh
npm test
npm run test:server
npm run build:mvp
npm run build
npm run check:customer
npx playwright install chromium webkit
npm run test:e2e
npm run test:mvp
npm run test:pages
```

Las pruebas cubren reglas de puntos y canjes, sesiones, acceso entre roles, intentos de asignarse puntos o leer otra cuenta, CSRF, solicitudes repetidas, persistencia SQLite, errores internos y el recorrido real cliente/administrador en Chromium y WebKit. La demo mantiene comprobaciones móviles, recuperación de descargas, almacenamiento bloqueado y acceso con el prefijo de GitHub Pages.

En este equipo, los navegadores están en `/private/tmp/pit-detail-browsers`: anteponer `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/pit-detail-browsers` a los comandos de Playwright.

Ramas: `main` para publicación y `develop` para integración. Esta separación se desarrolla en `feat/separate-customer-admin`. El remoto `github` es el repositorio compartido; `origin` conserva la copia anterior de Sites. El despliegue de Pages puede ejecutarse manualmente con el workflow `pages.yml`.
