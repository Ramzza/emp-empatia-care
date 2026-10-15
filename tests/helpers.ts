import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

const testDirectory = mkdtempSync(join(tmpdir(), "empatia-care-"));
process.env.PUBLIC_ORIGIN = "http://localhost";
process.env.APP_SECRET = "test-secret-that-is-long-enough-for-local-testing";
process.env.ADMIN_USERNAME = "clinic-admin";
process.env.ADMIN_PASSWORD = "test-admin-password-123";
process.env.DATABASE_PATH = join(testDirectory, "test.sqlite");

const [{ getDatabase, closeDatabase }, { handleApiRequest }, { setMailerForTests }, importer] = await Promise.all([
  import("../lib/server/database"),
  import("../lib/server/api"),
  import("../lib/server/email"),
  import("../lib/server/csv-import"),
]);

export const db = getDatabase();
export const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
let failEmailDelivery = false;
setMailerForTests(async (message) => {
  if (failEmailDelivery) throw new Error("SMTP delivery failed.");
  sentEmails.push(message);
});

after(() => {
  closeDatabase();
  rmSync(testDirectory, { recursive: true, force: true });
});

export function setFailEmailDelivery(value: boolean): void {
  failEmailDelivery = value;
}

export function hashCnp(cnp: string): string {
  return createHash("sha256").update(cnp).digest("hex");
}

export async function seedCnp(cnp: string): Promise<void> {
  importer.importCnpCsvText(`cnp\n${cnp}\n`);
}

export function nextWeekday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function nextSaturday(): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function apiRequest(path: string, method = "GET", body?: unknown, options: {
  origin?: string; cookie?: string; csrfToken?: string; ip?: string;
} = {}): Promise<Response> {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (method === "POST") headers.set("Origin", options.origin || "http://localhost");
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.csrfToken) headers.set("X-CSRF-Token", options.csrfToken);
  if (options.ip) headers.set("x-real-ip", options.ip);
  const request = new Request(new URL(path, "http://localhost"), {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return handleApiRequest(request);
}

export function jsonRequest(path: string, body: unknown, options?: {
  origin?: string; cookie?: string; csrfToken?: string; ip?: string;
}): Promise<Response> {
  return apiRequest(path, "POST", body, options);
}
