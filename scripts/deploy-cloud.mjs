import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";

// Run only after checks and migrations. No privileged Supabase key enters the Worker.
const required = [
  "APP_ORIGIN",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "COOKIE_SECRET",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_ACCESS_TOKEN",
];
for (const key of required)
  if (!process.env[key]) throw new Error(`Falta configurar ${key}.`);
const origin = new URL(process.env.APP_ORIGIN),
  supabase = new URL(process.env.SUPABASE_URL);
if (
  origin.protocol !== "https:" ||
  origin.origin !== process.env.APP_ORIGIN ||
  supabase.protocol !== "https:" ||
  supabase.hostname !== `${process.env.SUPABASE_PROJECT_REF}.supabase.co`
)
  throw new Error("Configura orígenes HTTPS exactos del proyecto.");
const publicKey = process.env.SUPABASE_ANON_KEY;
if (!publicKey.startsWith("sb_publishable_")) {
  let role;
  try {
    role = JSON.parse(
      Buffer.from(publicKey.split(".")[1], "base64url").toString(),
    ).role;
  } catch {}
  if (role !== "anon")
    throw new Error(
      "Usa la clave pública anon/publishable, nunca service_role.",
    );
}
if (process.env.COOKIE_SECRET.length < 32)
  throw new Error("COOKIE_SECRET necesita al menos 32 caracteres aleatorios.");
const email = process.env.EMAIL_ENABLED === "true",
  google = process.env.GOOGLE_ENABLED === "true";
if (!email && !google)
  throw new Error(
    "Configura y habilita al menos un método de acceso antes de publicar.",
  );
const response = await fetch(
  `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/config/auth`,
  { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } },
);
if (!response.ok)
  throw new Error(
    "No se pudo verificar la configuración de Auth del proyecto.",
  );
const auth = await response.json();
if (auth.disable_signup !== false)
  throw new Error(
    "El registro está cerrado en Supabase. Configura el proveedor de acceso y habilita el registro antes de publicar.",
  );
if (auth.site_url !== origin.origin)
  throw new Error("La Site URL de Supabase debe coincidir con APP_ORIGIN.");
const redirects = String(auth.uri_allow_list || "")
  .split(",")
  .map((s) => s.trim());
for (const path of ["/api/auth/callback", "/api/auth/recovery"])
  if (!redirects.includes(origin.origin + path))
    throw new Error(`Añade el redirect exacto ${path} en Supabase Auth.`);
if (email && (auth.mailer_autoconfirm !== false || !auth.smtp_host))
  throw new Error(
    "El acceso por correo necesita confirmación obligatoria y SMTP propio configurado.",
  );
if (google && !auth.external_google_enabled)
  throw new Error("Activa el proveedor Google en Supabase antes de publicar.");
if (!auth.mfa_totp_enroll_enabled || !auth.mfa_totp_verify_enabled)
  throw new Error("Activa el registro y la verificación TOTP en Supabase.");
if (Number(auth.password_min_length) < 12)
  throw new Error(
    "Configura una longitud mínima de contraseña de 12 caracteres en Supabase.",
  );
const anonymous = await fetch(supabase.origin + "/rest/v1/rpc/pit_my_member", {
  method: "POST",
  headers: { apikey: publicKey, "Content-Type": "application/json" },
  body: "{}",
});
if (![401, 403].includes(anonymous.status))
  throw new Error(
    "La comprobación de permisos anónimos no pasó. Revisa las migraciones.",
  );

const directory = mkdtempSync(join(tmpdir(), "pit-deploy-"));
try {
  const file = join(directory, "secrets.json");
  writeFileSync(
    file,
    JSON.stringify({
      SUPABASE_URL: supabase.origin,
      SUPABASE_ANON_KEY: publicKey,
      COOKIE_SECRET: process.env.COOKIE_SECRET,
    }),
    { mode: 0o600 },
  );
  const args = [
    "wrangler",
    "deploy",
    "--secrets-file",
    file,
    "--minify",
    "--var",
    `APP_ORIGIN:${origin.origin}`,
    "--var",
    `EMAIL_ENABLED:${email}`,
    "--var",
    `GOOGLE_ENABLED:${google}`,
  ];
  if (process.env.TURNSTILE_SITE_KEY)
    args.push("--var", `TURNSTILE_SITE_KEY:${process.env.TURNSTILE_SITE_KEY}`);
  execFileSync("npx", args, { stdio: "inherit" });
  const health = await fetch(origin.origin + "/api/health");
  if (!health.ok || !(await health.json()).ready)
    throw new Error(
      "El despliegue no pasó la comprobación de configuración. Conserva el enlace anterior.",
    );
  const config = await (await fetch(origin.origin + "/api/config")).json();
  if (
    config.portal !== "customer" ||
    (!config.emailEnabled && !config.googleEnabled)
  )
    throw new Error("El portal publicado no tiene el acceso previsto.");
  await QRCode.toFile("dist-cloud/qr-club.png", origin.origin, {
    width: 1200,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  writeFileSync("dist-cloud/enlace-club.txt", origin.origin + "\n");
  console.log(
    "Portal publicado. Comprueba el acceso con una cuenta real antes de sustituir el enlace de la beta. QR: dist-cloud/qr-club.png",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
