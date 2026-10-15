import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../server.js";

interface CsvLine {
  number: number;
  value: string;
}

function parseCsvLine(line: string, rowNumber: number): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? "";
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += character;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
      closedQuote = false;
    } else if (character === '"' && field.length === 0 && !closedQuote) {
      quoted = true;
    } else if (closedQuote && character.trim() !== "") {
      throw new Error(`Malformed CSV at row ${rowNumber}.`);
    } else if (character !== '"') {
      field += character;
    } else {
      throw new Error(`Malformed CSV at row ${rowNumber}.`);
    }
  }
  if (quoted) throw new Error(`Malformed CSV at row ${rowNumber}.`);
  fields.push(field);
  return fields;
}

function hashesFromCsv(csv: string): string[] {
  const normalized = csv.replace(/^\uFEFF/, "");
  const lines: CsvLine[] = normalized.split(/\r\n|\n|\r/)
    .map((value, index) => ({ number: index + 1, value }))
    .filter((line) => line.value.trim() !== "");
  if (lines.length === 0) throw new Error("The CSV must contain CNP values.");
  const header = parseCsvLine(lines[0]?.value ?? "", lines[0]?.number ?? 1);
  const headerIndex = header.findIndex((column) => column.trim().toLowerCase() === "cnp");
  const firstDataRow = headerIndex >= 0 ? 1 : 0;
  const cnpIndex = headerIndex >= 0 ? headerIndex : 0;
  if (headerIndex < 0 && header.length !== 1) {
    throw new Error("The CSV header must include a CNP column.");
  }
  const hashes = new Set<string>();
  for (const line of lines.slice(firstDataRow)) {
    const fields = parseCsvLine(line.value, line.number);
    const cnp = fields[cnpIndex]?.trim() ?? "";
    if (!/^\d{13}$/.test(cnp)) {
      throw new Error(`Invalid CNP at CSV row ${line.number}.`);
    }
    hashes.add(createHash("sha256").update(cnp).digest("hex"));
  }
  if (hashes.size === 0) throw new Error("The CSV must contain CNP values.");
  return [...hashes];
}

export function importCnpCsvText(csv: string): number {
  const hashes = hashesFromCsv(csv);
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
  const csv = readFileSync(path, "utf8");
  return importCnpCsvText(csv);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const csvPath = process.argv[2];
    if (!csvPath || process.argv.length > 3) {
      throw new Error("Usage: npm run import-cnps -- <cnp-list.csv>");
    }
    const imported = importCnpCsvFile(csvPath);
    console.log(`Imported ${imported} new CNP hash(es).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "CNP import failed.");
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
