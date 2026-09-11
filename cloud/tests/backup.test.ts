import { afterEach, expect, test } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
// @ts-expect-error The operational script runs directly in Node, outside the TS application.
import { encryptBackup, decryptBackup } from "../../scripts/backup-cloud.mjs";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
test("backup recovers the original bytes and rejects tampering or the wrong key before restore", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pit-backup-test-"));
  dirs.push(dir);
  const plain = join(dir, "original"),
    encrypted = join(dir, "encrypted"),
    restored = join(dir, "restored"),
    key = randomBytes(32),
    bytes = randomBytes(250000);
  writeFileSync(plain, bytes);
  await encryptBackup(plain, encrypted, key);
  await decryptBackup(encrypted, restored, key);
  expect(readFileSync(restored)).toEqual(bytes);
  await expect(encryptBackup(plain, encrypted, key)).rejects.toThrow();
  expect(existsSync(encrypted)).toBe(true);
  await expect(decryptBackup(encrypted, restored, key)).rejects.toThrow();
  expect(readFileSync(restored)).toEqual(bytes);
  await expect(
    decryptBackup(encrypted, join(dir, "wrong"), randomBytes(32)),
  ).rejects.toThrow();
  expect(existsSync(join(dir, "wrong"))).toBe(false);
  const damaged = readFileSync(encrypted);
  damaged[90] ^= 1;
  writeFileSync(encrypted, damaged);
  await expect(
    decryptBackup(encrypted, join(dir, "damaged"), key),
  ).rejects.toThrow();
  expect(existsSync(join(dir, "damaged"))).toBe(false);
});
