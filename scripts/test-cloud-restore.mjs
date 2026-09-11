import { execFileSync } from "node:child_process";
import { randomBytes, createHmac } from "node:crypto";
import { rmSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
// Disposable CI database only. Never load production variables here.
if (process.env.CI !== "true")
  throw new Error(
    "Esta prueba destructiva solo se ejecuta en la base desechable de CI.",
  );
const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
  encoding: "utf8",
});
const values = Object.fromEntries(
  [...output.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map((m) => [m[1], m[2]]),
);
const url = new URL(values.DB_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error("La base debe ser local.");
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port,
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
  PIT_BACKUP_KEY: randomBytes(32).toString("hex"),
  PIT_RESTORE_CONFIRM: "EMPTY_LOCAL_DATABASE",
};
const tables = [
  "auth.users",
  "auth.identities",
  "auth.mfa_factors",
  "private.roles",
  "public.profiles",
  "public.vehicles",
  "public.services",
  "public.redemptions",
  "public.points_ledger",
  "public.audit_events",
];
function snapshot() {
  return execFileSync(
    "psql",
    [
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      tables
        .map((table) => `select '${table}',count(*) from ${table}`)
        .join(";") +
        ";select 'ledger',sum(delta) from public.points_ledger;select 'policies',count(*) from pg_policies where schemaname in ('public','private');",
    ],
    { env, encoding: "utf8" },
  );
}
const before = snapshot(),
  backup = ".local/restore-test.pitbackup";
try {
  execFileSync("node", ["scripts/backup-cloud.mjs", "create", backup], {
    env,
    stdio: "inherit",
  });
  execFileSync("npx", ["supabase", "db", "reset", "--local", "--no-seed"], {
    stdio: "inherit",
  });
  execFileSync("node", ["scripts/backup-cloud.mjs", "restore-local", backup], {
    env,
    stdio: "inherit",
  });
  if (snapshot() !== before)
    throw new Error(
      "La restauración no conservó los registros, puntos y políticas.",
    );
  const sb = createClient(values.API_URL, values.ANON_KEY, {
    auth: { persistSession: false },
  });
  const login = await sb.auth.signInWithPassword({
    email: "admin@pit.test",
    password: "PIT-local-tests-only-2026!",
  });
  if (login.error || !login.data.user)
    throw new Error("La cuenta restaurada no puede iniciar sesión.");
  const factors = await sb.auth.mfa.listFactors();
  if (factors.error || !factors.data.totp.some((f) => f.status === "verified"))
    throw new Error("No se restauró el segundo factor.");
  const denied = await sb.rpc("pit_admin_customers", { p_search: "" });
  if (!denied.error)
    throw new Error(
      "Se permitió acceso administrativo sin segundo factor tras restaurar.",
    );
  const secret = readFileSync(".local/admin-test-factor.txt", "utf8");
  let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/, ""))
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(char)
      .toString(2)
      .padStart(5, "0");
  const factorKey = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))),
    time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", factorKey).update(time).digest(),
    offset = hash[19] & 15;
  const code = String(
    (hash.readUInt32BE(offset) & 0x7fffffff) % 1000000,
  ).padStart(6, "0");
  const verified = await sb.auth.mfa.challengeAndVerify({
    factorId: factors.data.totp.find((f) => f.status === "verified").id,
    code,
  });
  if (verified.error)
    throw new Error(
      "El autenticador restaurado no permite completar el acceso.",
    );
  const allowed = await sb.rpc("pit_admin_customers", { p_search: "" });
  if (allowed.error || !allowed.data.length)
    throw new Error(
      "El administrador restaurado no puede consultar los clientes con segundo factor.",
    );
  console.log(
    "Restauración verificada: identidades, 2FA, servicios, puntos, canjes, auditoría y permisos.",
  );
} finally {
  rmSync(backup, { force: true });
}
