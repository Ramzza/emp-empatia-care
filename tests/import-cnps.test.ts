import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, test } from "node:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashCnp as browserHashCnp } from "../lib/cnp";

const testDirectory = mkdtempSync(join(tmpdir(), "empatia-cnp-import-"));
process.env.DATABASE_PATH = join(testDirectory, "test.sqlite");
const [{ getDatabase, closeDatabase }, { initializeDatabase }] = await Promise.all([
  import("../lib/server/database"),
  import("../lib/server/database/schema"),
]);
const db = getDatabase();
const importerUrl = new URL("../lib/server/csv-import.ts", import.meta.url);

after(() => {
  closeDatabase();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("PRD-001: CSV import stores only distinct CNP hashes and browser hashing uses SHA-256", async () => {
  assert.ok(existsSync(importerUrl), "The CSV CNP importer must exist.");
  const importer = await import(importerUrl.href) as {
    importCnpCsvText(csv: string): number;
    importCnpCsvFile(path: string): number;
  };
  const firstCnp = "1234567890123";
  const secondCnp = "9876543210987";
  assert.equal(
    await browserHashCnp(firstCnp),
    createHash("sha256").update(firstCnp).digest("hex"),
  );
  await assert.rejects(browserHashCnp("not-a-cnp"), /13 digits/);

  const csv = [
    "Name,CNP,Notes",
    `"Temporary name",${firstCnp},ignored`,
    `"Another temporary name",${secondCnp},ignored`,
    `"Duplicate",${firstCnp},ignored`,
  ].join("\r\n");
  assert.equal(importer.importCnpCsvText(csv), 2);
  assert.equal(importer.importCnpCsvText(csv), 0);
  const stored = db.prepare("SELECT cnp_hash FROM authorized_patients ORDER BY cnp_hash")
    .all() as Array<{ cnp_hash: string }>;
  assert.deepEqual(
    stored.map((record) => record.cnp_hash),
    [firstCnp, secondCnp]
      .map((cnp) => createHash("sha256").update(cnp).digest("hex"))
      .sort(),
  );
  const csvPath = join(testDirectory, "clinic-list.csv");
  writeFileSync(csvPath, `CNP\n1111111111111\n`, { mode: 0o600 });
  assert.equal(importer.importCnpCsvFile(csvPath), 1);
  const databaseTables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>;
  assert.deepEqual(databaseTables.map((table) => table.name).sort(), ["appointments", "authorized_patients"]);
  assert.throws(() => importer.importCnpCsvText(`cnp\n${firstCnp}\ninvalid\n`), /row 3/);
  const count = db.prepare("SELECT COUNT(*) AS count FROM authorized_patients").get() as { count: number };
  assert.equal(count.count, 3);
  const rawCnpCount = db.prepare(`
    SELECT COUNT(*) AS count FROM authorized_patients
    WHERE cnp_hash IN (?, ?, ?)
  `).get(firstCnp, secondCnp, "1111111111111") as { count: number };
  assert.equal(rawCnpCount.count, 0);
});

test("PRD-001: migrating the previous account database removes all personal records", async () => {
  const { default: Database } = await import("better-sqlite3");
  const legacy = new Database(join(testDirectory, "legacy.sqlite"));
  legacy.exec(`
    CREATE TABLE users (id TEXT, email TEXT, name TEXT, role TEXT, salt TEXT, password_hash TEXT);
    CREATE TABLE doctor_patients (doctor_id TEXT, patient_id TEXT);
    CREATE TABLE sessions (token_hash TEXT, user_id TEXT, csrf_token TEXT, expires_at INTEGER);
    CREATE TABLE appointments (id TEXT, doctor_id TEXT, patient_id TEXT, starts_at TEXT);
    INSERT INTO users VALUES ('user-1', 'patient@example.test', 'Example Patient', 'patient', 'salt', 'hash');
    INSERT INTO appointments VALUES ('appt-1', 'doctor-1', 'user-1', '2026-10-16T09:00:00.000Z');
  `);
  initializeDatabase(legacy);
  const tables = legacy.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  assert.deepEqual(tables.map((table) => table.name), ["appointments", "authorized_patients"]);
  const legacyAppointments = legacy.prepare("SELECT * FROM appointments").all();
  assert.deepEqual(legacyAppointments, []);
  legacy.close();
});
