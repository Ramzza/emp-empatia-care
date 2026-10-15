import { readFileSync, statSync } from "node:fs";
import { getDatabase } from "./database";
import { hashesFromCsv } from "./csv-parser";

export function importCnpCsvText(csv: string): number {
  const hashes = hashesFromCsv(csv);
  const db = getDatabase();
  const insert = db.prepare("INSERT OR IGNORE INTO authorized_patients (cnp_hash) VALUES (?)");
  let imported = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const hash of hashes) imported += insert.run(hash).changes;
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return imported;
}

export function importCnpCsvFile(path: string): number {
  const file = statSync(path);
  if (!file.isFile()) throw new Error("Provide a CSV file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("CSV files must not exceed 10 MB.");
  return importCnpCsvText(readFileSync(path, "utf8"));
}
