import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}

const directory = mkdtempSync(join(tmpdir(), "pit-isolation-"));
try {
  execFileSync(
    process.execPath,
    ["scripts/check-customer-build.js", "dist-cloud"],
    { stdio: "inherit" },
  );
  for (const [portal, config] of [
    ["customer", "wrangler.jsonc"],
  ]) {
    execFileSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "deploy",
        "--config",
        config,
        "--dry-run",
        "--minify",
        "--outdir",
        join(directory, portal),
      ],
      {
        env: {
          ...process.env,
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_LOG_PATH: join(directory, "logs"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const code = files(join(directory, portal))
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    if (!code) throw new Error("No se generó la API " + portal);
    const administrativeOperations = [
      "pit_admin_customers",
      "pit_admin_member",
      "pit_add_service",
      "pit_void_service",
      "pit_redeem",
      "pit_update_rules",
      "pit_admin_save_contact",
      "pit_admin_save_vehicle",
      "pit_admin_save_service_record",
      "audit_events",
    ];
    for (const operation of administrativeOperations) {
      if (portal === "customer" && code.includes(operation))
        throw new Error(
          "La API pública incluye una operación administrativa: " + operation,
        );
      if (portal === "admin" && !code.includes(operation))
        throw new Error("La API administrativa no incluye " + operation);
    }
    console.log("API " + portal + ": contenido del paquete comprobado.");
  }
  console.log("Customer frontend and API isolation verified.");
} catch (error) {
  console.error(
    error.status === undefined
      ? error.message
      : "Falló el empaquetado de las APIs para comprobar su aislamiento.",
  );
  process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
