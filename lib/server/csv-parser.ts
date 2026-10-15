import { createHash } from "node:crypto";

interface CsvLine {
  number: number;
  value: string;
}

export function parseCsvLine(line: string, rowNumber: number): string[] {
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
      } else field += character;
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
      closedQuote = false;
    } else if (character === '"' && field.length === 0 && !closedQuote) quoted = true;
    else if (closedQuote && character.trim() !== "") throw new Error(`Malformed CSV at row ${rowNumber}.`);
    else if (character !== '"') field += character;
    else throw new Error(`Malformed CSV at row ${rowNumber}.`);
  }
  if (quoted) throw new Error(`Malformed CSV at row ${rowNumber}.`);
  fields.push(field);
  return fields;
}

export function hashesFromCsv(csv: string): string[] {
  const lines: CsvLine[] = csv.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)
    .map((value, index) => ({ number: index + 1, value }))
    .filter((line) => line.value.trim() !== "");
  if (lines.length === 0) throw new Error("The CSV must contain CNP values.");
  const header = parseCsvLine(lines[0]?.value ?? "", lines[0]?.number ?? 1);
  const headerIndex = header.findIndex((column) => column.trim().toLowerCase() === "cnp");
  const firstDataRow = headerIndex >= 0 ? 1 : 0;
  const cnpIndex = headerIndex >= 0 ? headerIndex : 0;
  if (headerIndex < 0 && header.length !== 1) throw new Error("The CSV header must include a CNP column.");
  const hashes = new Set<string>();
  for (const line of lines.slice(firstDataRow)) {
    const cnp = parseCsvLine(line.value, line.number)[cnpIndex]?.trim() ?? "";
    if (!/^\d{13}$/.test(cnp)) throw new Error(`Invalid CNP at CSV row ${line.number}.`);
    hashes.add(createHash("sha256").update(cnp).digest("hex"));
  }
  if (hashes.size === 0) throw new Error("The CSV must contain CNP values.");
  return [...hashes];
}
