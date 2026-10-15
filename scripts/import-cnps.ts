import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase } from "../lib/server/database";
import { importCnpCsvFile } from "../lib/server/csv-import";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const csvPath = process.argv[2];
    if (!csvPath || process.argv.length > 3) throw new Error("Usage: npm run import-cnps -- <cnp-list.csv>");
    const imported = importCnpCsvFile(csvPath);
    console.log(`Imported ${imported} new CNP hash(es).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "CNP import failed.");
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}
