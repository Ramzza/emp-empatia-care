import type Database from "better-sqlite3";

const appointmentColumns = ["id", "cnp_hash", "doctor_id", "starts_at", "ends_at", "status", "created_at"];

function tableColumns(database: Database.Database, tableName: string): string[] {
  const rows = database.pragma(`table_info("${tableName.replaceAll('"', '""')}")`) as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

export function initializeDatabase(database: Database.Database): void {
  database.pragma("foreign_keys = OFF");
  database.pragma("journal_mode = WAL");
  const tableRows = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  const existingTables = tableRows.map((row) => row.name);
  const expectedTables = ["appointments", "authorized_patients"];
  const currentSchema = existingTables.length === 2 &&
    existingTables.every((name, index) => name === expectedTables[index]) &&
    tableColumns(database, "authorized_patients").join(",") === "cnp_hash" &&
    tableColumns(database, "appointments").join(",") === appointmentColumns.join(",");

  if (existingTables.length > 0 && !currentSchema) {
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const tableName of existingTables) {
        database.exec(`DROP TABLE "${tableName.replaceAll('"', '""')}"`);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS authorized_patients (
      cnp_hash TEXT PRIMARY KEY CHECK (
        length(cnp_hash) = 64 AND cnp_hash NOT GLOB '*[^0-9a-f]*'
      )
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY CHECK (length(id) = 64 AND id NOT GLOB '*[^0-9a-f]*'),
      cnp_hash TEXT NOT NULL REFERENCES authorized_patients(cnp_hash),
      doctor_id TEXT NOT NULL CHECK (doctor_id IN ('darko', 'lorenzovici')),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'cancelled', 'completed')),
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_patient_active_idx
      ON appointments(cnp_hash) WHERE status IN ('pending', 'active');
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_active_idx
      ON appointments(doctor_id, starts_at) WHERE status IN ('pending', 'active');
    CREATE INDEX IF NOT EXISTS appointments_active_time_idx
      ON appointments(status, starts_at);
  `);
  database.pragma("foreign_keys = ON");
  if (existingTables.length > 0 && !currentSchema) {
    database.pragma("wal_checkpoint(TRUNCATE)");
    database.exec("VACUUM");
    database.pragma("wal_checkpoint(TRUNCATE)");
  }
}
