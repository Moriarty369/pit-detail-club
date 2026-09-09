import {
  createReadStream,
  createWriteStream,
  mkdtempSync,
  mkdirSync,
  rmSync,
  openSync,
  readSync,
  closeSync,
  appendFileSync,
  statSync,
} from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
const magic = Buffer.from("PITBACKUP1");
export async function encryptBackup(source, destination, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(magic);
  const output = createWriteStream(destination, {
    fd: openSync(destination, "wx", 0o600),
  });
  output.write(Buffer.concat([magic, iv]));
  try {
    await pipeline(createReadStream(source), cipher, output);
    appendFileSync(destination, cipher.getAuthTag());
  } catch (error) {
    rmSync(destination, { force: true });
    throw error;
  }
}
export async function decryptBackup(source, destination, key) {
  const size = statSync(source).size,
    header = Buffer.alloc(magic.length + 12),
    tag = Buffer.alloc(16),
    fd = openSync(source, "r");
  try {
    if (size < header.length + 16) throw new Error("Copia incompleta.");
    readSync(fd, header, 0, header.length, 0);
    readSync(fd, tag, 0, 16, size - 16);
  } finally {
    closeSync(fd);
  }
  if (!header.subarray(0, magic.length).equals(magic))
    throw new Error("Formato de copia desconocido.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    header.subarray(magic.length),
  );
  decipher.setAAD(magic);
  decipher.setAuthTag(tag);
  const output = createWriteStream(destination, {
    fd: openSync(destination, "wx", 0o600),
  });
  try {
    await pipeline(
      createReadStream(source, { start: header.length, end: size - 17 }),
      decipher,
      output,
    );
  } catch {
    rmSync(destination, { force: true });
    throw new Error(
      "Copia dañada o clave incorrecta. No se ha restaurado ningún dato.",
    );
  }
}
async function main() {
  const [operation, file] = process.argv.slice(2);
  if (!["create", "restore-local"].includes(operation) || !file)
    throw new Error(
      "Uso: node scripts/backup-cloud.mjs create|restore-local archivo.pitbackup",
    );
  if (!/^[a-f0-9]{64}$/i.test(process.env.PIT_BACKUP_KEY || ""))
    throw new Error(
      "Configura PIT_BACKUP_KEY con 32 bytes aleatorios en hexadecimal y guárdala fuera de las copias.",
    );
  for (const name of ["PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGPASSWORD"])
    if (!process.env[name])
      throw new Error(
        `Falta ${name}. Usa variables PostgreSQL; no incluyas claves en argumentos.`,
      );
  const key = Buffer.from(process.env.PIT_BACKUP_KEY, "hex"),
    directory = mkdtempSync(join(tmpdir(), "pit-backup-")),
    plain = join(directory, "database.dump");
  function run(command, args) {
    try {
      return execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      throw new Error(
        `${command} falló. Comprueba conexión, versión de PostgreSQL y permisos; no se muestran credenciales.`,
      );
    }
  }
  try {
    if (operation === "create") {
      // One consistent snapshot includes identities, factors and the complete points ledger.
      run("pg_dump", [
        "--format=custom",
        "--data-only",
        "--no-owner",
        "--no-privileges",
        "--schema=public",
        "--schema=private",
        "--schema=auth",
        "--exclude-table-data=auth.schema_migrations",
        "--file=" + plain,
      ]);
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      await encryptBackup(plain, file, key);
      console.log(
        "Copia de datos cifrada. Conserva también las migraciones y la configuración de proveedores.",
      );
    } else {
      if (
        !["127.0.0.1", "localhost", "::1"].includes(process.env.PGHOST) ||
        process.env.PIT_RESTORE_CONFIRM !== "EMPTY_LOCAL_DATABASE"
      )
        throw new Error(
          "La restauración automática solo admite una base local desechable y PIT_RESTORE_CONFIRM=EMPTY_LOCAL_DATABASE.",
        );
      const count = run("psql", [
        "-X",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "select (select count(*) from auth.users)+(select count(*) from public.profiles)+(select count(*) from public.points_ledger);",
      ]);
      if (count.trim() !== "0")
        throw new Error(
          "La base destino contiene cuentas o puntos. No se modificará.",
        );
      await decryptBackup(file, plain, key);
      // club_rules contains the migration's single default row even in a fresh database.
      // Delete that row and restore in ONE transaction, using a generated SQL script.
      const sqlFile = join(directory, "restore.sql");
      run("pg_restore", [
        "--data-only",
        "--disable-triggers",
        "--no-owner",
        "--no-privileges",
        "--file=" + sqlFile,
        plain,
      ]);
      try {
        execFileSync(
          "psql",
          [
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "--single-transaction",
            "--command",
            "delete from public.club_rules;",
            "--file",
            sqlFile,
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
      } catch {
        throw new Error("La restauración falló y se revirtió la transacción.");
      }
      console.log(
        "Datos restaurados en la base local. Valida acceso, 2FA, saldos e historial antes de una recuperación real.",
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
