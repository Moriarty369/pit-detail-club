# PIT DETAIL Club · demo funcional

Primera versión navegable para validar la fidelización antes de conectar cuentas reales. Incluye diseño adaptable al móvil, referencia visual PIT DETAIL, tarjeta con QR, beneficios por puntos, rappel trimestral, historial, perfil, alta simulada y panel del negocio.

## Ejecutar

```sh
cd pit-detail-club
npm install
npm run dev
```

Abrir http://127.0.0.1:5173. Para compilar: `npm run build`. Para revisar la compilación: `npm run preview`.

Para probar desde otro dispositivo de confianza en la misma Wi-Fi, iniciar con `npm run dev -- --host 0.0.0.0` y abrir la dirección Network mostrada por Vite. El QR de acceso del panel acepta esa dirección o una URL pública donde se haya alojado la aplicación. Un QR de localhost no lleva del móvil al ordenador. No exponer el servidor de desarrollo a Internet.

## Recorrido de prueba

1. La cuenta ficticia Alex Mendoza comienza con tres servicios y 1.250 puntos.
2. En Mi club, canjear «Cuida tu motor» por 1.000 puntos. Generar el código no descuenta puntos.
3. Pulsar «Probar validación en el negocio», comprobar las condiciones y validar. El saldo pasa a 250. Volver a validar el código produce un error.
4. Registrar un servicio por $25 desde el panel. Se añaden 250 puntos con la regla inicial.
5. Consultar Mis servicios y filtrar por local/domicilio. Recargar conserva los datos en este navegador.
6. En el panel se pueden cambiar las reglas. En Mi perfil se puede probar un registro que crea un perfil vacío; no envía correo.
7. Restablecer demo vuelve al perfil inicial tras confirmarlo.

## Reglas provisionales

- Moneda de demostración USD. No hay conversión a bolívares ni integración de cobros.
- 10 puntos por $1 elegible; se redondean hacia abajo por servicio. Excluir desplazamiento del importe introducido.
- Ofertas por 1.000, 1.500 y 2.500 puntos con condiciones visibles antes de solicitar el código.
- Rappel: al llegar a $250 en el trimestre, desbloquear 5% sobre mano de obra de un próximo servicio. Un canje por trimestre, sin acumulación con otras promociones. Se calcula con zona `America/Caracas`.
- Códigos válidos cinco minutos. Se revalidan saldo/umbral y estado al consumirlos. Los ajustes de reglas se bloquean mientras haya códigos vigentes. Los puntos históricos no se recalculan.

Las condiciones son hipótesis de producto para probar el recorrido, no tarifas o promociones comerciales aprobadas. El panel registra que el empleado ha revisado las condiciones; no calcula facturas ni aplica automáticamente descuentos a una orden.

## Límite de esta versión

**Es una demo local, no un sistema seguro para clientes reales.** El estado vive en `localStorage`, puede modificarse desde el navegador y no se comparte entre dispositivos ni sincroniza entre pestañas. El panel es abierto y el registro no verifica el correo. El QR de tarjeta solo contiene un identificador ficticio; no autentica. No hay reservas, notificaciones, cobros ni aplicación de cambios a sistemas externos.

Para un piloto real: conectar base de datos y autenticación con verificación, autorización por usuario y rol en el servidor, MFA de administradores, registro de eventos y transacciones atómicas con idempotencia, devoluciones/anulaciones, recuperación de cuenta, límites de solicitudes, términos definitivos y despliegue HTTPS. Revalidar los flujos con concurrencia real antes de incorporar clientes.

La imagen del logo es la referencia JPEG recuperada. Aparece en la navegación de escritorio, la cabecera móvil, la tarjeta de cliente, su ventana QR y el perfil. El encuadre CSS reduce los márgenes negros conservando la imagen y sus proporciones. Los dibujos de las ofertas son ilustraciones SVG del prototipo. No se han usado fotografías de trabajos de Instagram. Las fuentes DM Sans y Barlow Condensed se cargan desde Google Fonts con alternativas del sistema.

## Comprobaciones

```sh
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/pit-detail-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/pit-detail-browsers npm run test:e2e
```

Pruebas de negocio: puntos, duplicados, saldo insuficiente, expiración, canjes, límites de trimestre y cambios de reglas. Pruebas de navegador: recorrido de canje y servicio, persistencia, registro, escape de HTML, generación de QR y ausencia de desbordamiento en móvil.

Se utiliza [Vite 6](https://v6.vite.dev/guide/) por compatibilidad con el Node 20.10 disponible y [node-qrcode](https://github.com/soldair/node-qrcode) para generar QR reales. Dependencias fijadas en `package-lock.json`.

## Beta compartida y repositorio

Ramas: `main` (versión publicable), `develop` (integración) y `beta/colaboracion` (trabajo de la beta). Las próximas mejoras parten de `develop` en una rama nueva. La primera copia remota está en ChatGPT Sites (`origin`); el destino preparado para publicar es GitHub Pages, mediante el remoto `github` cuando se complete la autenticación.

`.github/workflows/pages.yml` ejecuta las pruebas y publica en Pages al recibir cambios en `main`. `develop` y las ramas de trabajo no publican automáticamente. Vite recibe `PIT_BASE_PATH=/<nombre-del-repositorio>/` en el workflow. Para probar esa compilación localmente:

```sh
PIT_BASE_PATH=/pit-detail-club/ npm run build
PIT_BASE_PATH=/pit-detail-club/ npm run preview
```

Abrir http://127.0.0.1:4173/pit-detail-club/. El nombre del repositorio en el workflow se obtiene automáticamente del evento de GitHub.

Una vez verificada la URL pública, `node scripts/share-qr.js https://URL-PUBLICA/ ../compartir` genera PNG y SVG del QR y un texto para compartir. No generar el QR final antes de comprobar que la publicación responde.

«Aportar idea» prepara un comentario que el socio puede copiar y enviar al grupo por su cuenta. No se reciben ni almacenan comentarios en un servidor. Cada dispositivo mantiene su propia demo.

El acceso a la beta es público. `noindex` y `robots.txt` solicitan que no se indexe, pero no son control de acceso. No introducir datos reales. Esta beta no cobra, no recibe reservas y no permite canjes comerciales reales.

GitHub Pages permite alojamiento de proyectos en repositorios públicos con GitHub Free. Esta publicación es una demostración para validar ideas; el sistema comercial definitivo requerirá un alojamiento y un backend apropiados. Documentación: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

El intento inicial en Sites conserva su identificador en `.openai/hosting.json`, su remoto y la versión guardada. Falló al publicar por un error interno 409 de callbacks. No se debe crear otro Site para este mismo proyecto. `scripts/package-site.py` permite empaquetar la compilación estática para retomar ese alojamiento; para ello compilar con la base predeterminada `/`.
