import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import Database from "better-sqlite3";
import { hashCnp } from "../lib/cnp";
import { initializeDatabase } from "../lib/server/database/schema";
import { db } from "./helpers";

test("PRD-001: only hashed CNPs and appointment records are stored", async () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
  assert.deepEqual(tables.map((table) => table.name), ["appointments", "authorized_patients"]);
  const patientColumns = db.pragma("table_info(authorized_patients)") as Array<{ name: string }>;
  assert.deepEqual(patientColumns.map((column) => column.name), ["cnp_hash"]);
  const appointmentColumns = db.pragma("table_info(appointments)") as Array<{ name: string }>;
  assert.deepEqual(appointmentColumns.map((column) => column.name), ["id", "cnp_hash", "doctor_id", "starts_at", "ends_at", "status", "created_at"]);
  const cnp = "1234567890123";
  assert.equal(await hashCnp(cnp), createHash("sha256").update(cnp).digest("hex"));
  await assert.rejects(hashCnp("not-a-cnp"), /13 digits/);
});

test("PRD-001: legacy account data is deleted when initializing the new database schema", () => {
  const legacy = new Database(":memory:");
  legacy.exec("CREATE TABLE users (email TEXT); CREATE TABLE appointments (id TEXT); INSERT INTO users VALUES ('old@example.test');");
  initializeDatabase(legacy);
  const records = legacy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
  assert.deepEqual(records.map((table) => table.name), ["appointments", "authorized_patients"]);
  assert.deepEqual(legacy.prepare("SELECT * FROM appointments").all(), []);
  legacy.close();
});
