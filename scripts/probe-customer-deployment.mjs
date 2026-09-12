// Small read-only probe. Never signs in, creates accounts, sends email or changes points.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const origin =
  process.env.PIT_PROBE_ORIGIN || "https://club.pit-detail.workers.dev";
if (
  !["https://club.pit-detail.workers.dev", "http://127.0.0.1:8787"].includes(
    origin,
  )
)
  throw new Error("Unsupported probe origin");
const checks = [];
const headers = [
  "cache-control",
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "access-control-allow-origin",
  "content-type",
];
async function get(path, extra = {}) {
  const start = performance.now();
  let r = await fetch(origin + path, {
    headers: extra,
    signal: AbortSignal.timeout(15000),
    redirect: "manual",
  });
  let redirectedTo;
  if ([301, 302, 307, 308].includes(r.status) && ["/privacidad.html", "/condiciones.html"].includes(path)) {
    const target = new URL(r.headers.get("location") || "", origin);
    if (target.origin !== origin || !["/privacidad", "/condiciones"].includes(target.pathname)) throw new Error("Unexpected information-page redirect");
    redirectedTo = target.pathname;
    r = await fetch(target, { signal: AbortSignal.timeout(15000), redirect: "manual" });
  }
  const text = await r.text();
  checks.push({
    path,
    ...(redirectedTo ? { redirectedTo } : {}),
    status: r.status,
    ms: Math.round(performance.now() - start),
    bytes: Buffer.byteLength(text),
    headers: Object.fromEntries(headers.map((k) => [k, r.headers.get(k)])),
    ...(path.startsWith("/api/") &&
    r.headers.get("content-type")?.includes("json")
      ? { body: JSON.parse(text) }
      : {}),
  });
  return text;
}
const html = await get("/");
const assets = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))"/g)].map(
  (m) => m[1],
);
const fingerprints = [];
for (const path of assets) {
  const body = await get(path);
  fingerprints.push({
    path,
    sha256: createHash("sha256").update(body).digest("hex"),
    hasWelcomeAnimation:
      body.includes("Has recibido") || body.includes("points-feedback"),
    hasNewAdminForm: body.includes("Guardar ficha del servicio"),
  });
}
for (const path of [
  "/privacidad.html",
  "/condiciones.html",
  "/api/health",
  "/api/config",
  "/api/session",
  "/api/me",
  "/api/admin/customers",
  "/api/does-not-exist",
  "/.env",
  "/.git/config",
])
  await get(path);
await get("/api/me", { Origin: "https://outside.example.test" });
const report = {
  checkedAt: new Date().toISOString(),
  origin,
  checks,
  fingerprints,
  limitations:
    "Una muestra ligera anónima; no mide capacidad de login, CPU del Worker ni entrega de correo.",
};
mkdirSync(".local/readiness-100", { recursive: true });
writeFileSync(
  ".local/readiness-100/deployment-probe.json",
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    origin,
    checks: checks.map((c) => ({
      path: c.path,
      status: c.status,
      ms: c.ms,
      bytes: c.bytes,
      body: c.body,
    })),
    fingerprints,
  }),
);

const failures = [];
const first = path => checks.find(c => c.path === path);
for (const path of ["/", "/privacidad.html", "/condiciones.html", "/api/health", "/api/config"])
  if (first(path)?.status !== 200) failures.push(path + ": unavailable");
for (const path of ["/api/session", "/api/me"])
  if (first(path)?.status !== 401) failures.push(path + ": anonymous access not denied");
if (first("/api/admin/customers")?.status !== 404) failures.push("Public administration routes must return 404");
if (checks.at(-1)?.status !== 403) failures.push("Foreign origin not rejected");
for (const path of ["/", "/api/health", "/api/me", "/privacidad.html"])
  if (!first(path)?.headers["content-security-policy"] || (origin.startsWith("https:") && !first(path)?.headers["strict-transport-security"])) failures.push(path + ": missing security headers");
for (const c of checks.filter(c => c.path.startsWith("/api/")))
  if (!c.headers["cache-control"]?.includes("no-store")) failures.push(c.path + ": caching must be disabled");
if (fingerprints.some(f => f.hasNewAdminForm)) failures.push("Private admin UI present in customer assets");
if (failures.length) { console.error(JSON.stringify({ failures })); process.exitCode = 1; }
