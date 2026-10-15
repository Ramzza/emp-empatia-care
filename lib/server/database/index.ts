import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { initializeDatabase } from "./schema";

let database: Database.Database | undefined;

export function getDatabase(): Database.Database {
  if (!database) {
    const path = resolve(process.env.DATABASE_PATH || resolve(process.cwd(), "data/empatia.sqlite"));
    mkdirSync(dirname(path), { recursive: true });
    const opened = new Database(path, { timeout: 5000 });
    try {
      initializeDatabase(opened);
      database = opened;
    } catch (error) {
      opened.close();
      throw error;
    }
  }
  return database;
}

export function closeDatabase(): void {
  if (database?.open) database.close();
  database = undefined;
}
