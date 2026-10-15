import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createTransport } from "nodemailer";
import Database from "better-sqlite3";

type JsonObject = Record<string, unknown>;

interface DoctorReference {
  id: string;
  name: string;
}

interface AppointmentRow {
  id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  status: "active";
}

interface AdminSession {
  csrfToken: string;
  expiresAt: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface ConfirmationEmail {
  to: string;
  subject: string;
  text: string;
}

export interface AppServerOptions {
  sendConfirmationEmail?: (message: ConfirmationEmail) => Promise<void>;
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const root = existsSync(resolve(moduleDirectory, "public/index.html")) ? moduleDirectory : resolve(moduleDirectory, "..");
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000);
const origin = process.env.PUBLIC_ORIGIN || `http://localhost:${port}`;
const appSecret = process.env.APP_SECRET || "local-development-key-not-for-production";
const cookieName = "empatia_admin";
const sessionLifetime = 12 * 60 * 60 * 1000;
const pendingLifetime = 10 * 60 * 1000;
const bookingFields = new Set(["cnpHash", "email", "doctorId", "startsAt", "turnstileToken", "website"]);
const configuredAdminUsername = process.env.ADMIN_USERNAME?.trim() || "";
const configuredAdminPassword = process.env.ADMIN_PASSWORD || "";
const adminPasswordSalt = randomBytes(16).toString("hex");
const adminPasswordHash = configuredAdminPassword
  ? scryptSync(configuredAdminPassword, adminPasswordSalt, 64, { N: 16384, r: 8, p: 1 }).toString("hex")
  : "";
const timeZone = "Europe/Bucharest";
const formatter = new Intl.DateTimeFormat("ro-RO", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const rateLimits = new Map<string, RateLimitEntry>();
const doctors: DoctorReference[] = [
  { id: "darko", name: "Dr. Darkó Zsuzsanna" },
  { id: "lorenzovici", name: "Dr. Lorenzovici Anna" },
];

if (production) {
  if (!process.env.APP_SECRET || Buffer.byteLength(process.env.APP_SECRET) < 32) {
    throw new Error("Production requires APP_SECRET with at least 32 bytes.");
  }
  if (!process.env.PUBLIC_ORIGIN?.startsWith("https://")) {
    throw new Error("Production requires an HTTPS PUBLIC_ORIGIN.");
  }
  if (!process.env.TURNSTILE_SITE_KEY || !process.env.TURNSTILE_SECRET_KEY) {
    throw new Error("Production requires TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.");
  }
  if (!process.env.TURNSTILE_EXPECTED_HOSTNAME) {
    throw new Error("Production requires TURNSTILE_EXPECTED_HOSTNAME.");
  }
  if (!configuredAdminUsername || configuredAdminUsername.length > 120 ||
      configuredAdminPassword.length < 12 || configuredAdminPassword.length > 1024) {
    throw new Error("Production requires a valid ADMIN_USERNAME and an ADMIN_PASSWORD of 12 to 1024 characters.");
  }
  if (!process.env.MAIL_HOST || !process.env.MAIL_PORT || !process.env.MAIL_FROM ||
      !process.env.MAIL_USERNAME || !process.env.MAIL_PASSWORD) {
    throw new Error("Production requires MAIL_HOST, MAIL_PORT, MAIL_FROM, MAIL_USERNAME, and MAIL_PASSWORD.");
  }
  const mailPort = Number(process.env.MAIL_PORT);
  if (!Number.isInteger(mailPort) || mailPort < 1 || mailPort > 65535) {
    throw new Error("MAIL_PORT must be a valid TCP port.");
  }
}

const databasePath = resolve(process.env.DATABASE_PATH || resolve(root, "data/empatia.sqlite"));
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new Database(databasePath, { timeout: 5000 });

const appointmentColumns = ["id", "cnp_hash", "doctor_id", "starts_at", "ends_at", "status", "created_at"];

function tableColumns(database: Database.Database, tableName: string): string[] {
  const rows = database.pragma(`table_info("${tableName.replaceAll('"', '""')}")`) as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

export function initializeDatabase(database: Database.Database = db): void {
  database.pragma("foreign_keys = OFF");
  database.pragma("journal_mode = WAL");
  const tableRows = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  const existingTables = tableRows.map((row) => row.name);
  const expectedTables = ["appointments", "authorized_patients"];
  const hasCurrentSchema = existingTables.length === expectedTables.length &&
    existingTables.every((name, index) => name === expectedTables[index]) &&
    tableColumns(database, "authorized_patients").join(",") === "cnp_hash" &&
    tableColumns(database, "appointments").join(",") === appointmentColumns.join(",");

  if (existingTables.length > 0 && !hasCurrentSchema) {
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

  if (existingTables.length > 0 && !hasCurrentSchema) {
    database.pragma("wal_checkpoint(TRUNCATE)");
    database.exec("VACUUM");
    database.pragma("wal_checkpoint(TRUNCATE)");
  }
}

initializeDatabase();

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

function requestIp(req: IncomingMessage): string {
  return req.socket.remoteAddress || "unknown";
}

function rateLimit(req: IncomingMessage, key: string, max: number, windowMs: number): boolean {
  const ipDigest = createHmac("sha256", appSecret).update(requestIp(req)).digest("hex");
  const bucketKey = `${key}:${ipDigest}`;
  const now = Date.now();
  if (rateLimits.size > 5000) {
    for (const [candidate, entry] of rateLimits) {
      if (entry.resetAt <= now) rateLimits.delete(candidate);
    }
    while (rateLimits.size > 5000) {
      const oldestKey = rateLimits.keys().next().value;
      if (oldestKey === undefined) break;
      rateLimits.delete(oldestKey);
    }
  }
  const previous = rateLimits.get(bucketKey);
  let allowed = false;
  if (!previous || previous.resetAt <= now) {
    rateLimits.set(bucketKey, { count: 1, resetAt: now + windowMs });
    allowed = true;
  } else {
    previous.count += 1;
    allowed = previous.count <= max;
  }
  return allowed;
}

async function readJson(req: IncomingMessage): Promise<JsonObject> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) {
      throw new HttpError("Request body too large.", 413);
    }
  }
  try {
    const value: unknown = JSON.parse(body || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as JsonObject;
  } catch {
    throw new HttpError("Invalid JSON request.", 400);
  }
}

function requestCookie(req: IncomingMessage, name: string): string {
  const cookies = req.headers.cookie || "";
  let result = "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) result = value.join("=");
  }
  return result;
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function validateWrite(req: IncomingMessage, csrfToken?: string): boolean {
  const requestOrigin = req.headers.origin;
  const csrf = req.headers["x-csrf-token"];
  let valid = requestOrigin === origin;
  if (csrfToken !== undefined) {
    valid = valid && typeof csrf === "string" && safeEqual(csrf, csrfToken);
  }
  return valid;
}

function serializeAdminSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", appSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function adminSessionFor(req: IncomingMessage): AdminSession | null {
  const token = requestCookie(req, cookieName);
  const parts = token.split(".");
  let session: AdminSession | null = null;
  if (parts.length === 2 && parts[0] && parts[1]) {
    const [payload, signature] = parts;
    const expected = createHmac("sha256", appSecret).update(payload).digest("base64url");
    if (safeEqual(signature, expected)) {
      try {
        const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (typeof value === "object" && value !== null &&
            "csrfToken" in value && typeof value.csrfToken === "string" &&
            "expiresAt" in value && typeof value.expiresAt === "number" &&
            value.expiresAt > Date.now()) {
          session = { csrfToken: value.csrfToken, expiresAt: value.expiresAt };
        }
      } catch {
        session = null;
      }
    }
  }
  return session;
}

function sessionCookie(session: AdminSession): string {
  const options = [
    `${cookieName}=${serializeAdminSession(session)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(sessionLifetime / 1000)}`,
  ];
  if (production) options.push("Secure");
  return options.join("; ");
}

function expiredSessionCookie(): string {
  const options = [`${cookieName}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (production) options.push("Secure");
  return options.join("; ");
}

function parseDate(date: string): Date | null {
  let parsed: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const candidate = new Date(`${date}T12:00:00.000Z`);
    if (!Number.isNaN(candidate.getTime()) && candidate.toISOString().slice(0, 10) === date) {
      parsed = candidate;
    }
  }
  return parsed;
}

function localDateTimeToUtc(date: string, time: string): Date {
  const desired = Date.parse(`${date}T${time}:00.000Z`);
  let guess = desired;
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    guess = desired - (represented - guess);
  }
  return new Date(guess);
}

function completeExpiredAppointments(now: string): void {
  db.prepare("UPDATE appointments SET status = 'completed' WHERE status = 'active' AND ends_at <= ?").run(now);
  const pendingBefore = new Date(Date.now() - pendingLifetime).toISOString();
  db.prepare("DELETE FROM appointments WHERE status = 'pending' AND created_at <= ?").run(pendingBefore);
}

export function availableSlots(doctorId: string, date: string): string[] {
  const parsed = parseDate(date);
  const slots: string[] = [];
  if (parsed && parsed.getUTCDay() !== 0 && parsed.getUTCDay() !== 6) {
    completeExpiredAppointments(new Date().toISOString());
    for (let minute = 9 * 60; minute < 17 * 60; minute += 30) {
      const hour = String(Math.floor(minute / 60)).padStart(2, "0");
      const mins = String(minute % 60).padStart(2, "0");
      const startsAt = localDateTimeToUtc(date, `${hour}:${mins}`);
      if (startsAt.getTime() > Date.now()) {
        const startIso = startsAt.toISOString();
        const booked = db.prepare(`
          SELECT 1 FROM appointments
          WHERE doctor_id = ? AND starts_at = ? AND status IN ('pending', 'active')
        `).get(doctorId, startIso) as { 1: number } | undefined;
        if (!booked) slots.push(startIso);
      }
    }
  }
  return slots;
}

async function verifyTurnstile(token: unknown, req: IncomingMessage): Promise<boolean> {
  let valid = !production;
  if (production && typeof token === "string" && token.length > 0 && token.length <= 2048) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const body = new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY ?? "",
        response: token,
        remoteip: requestIp(req),
      });
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
      if (response.ok) {
        const result: unknown = await response.json();
        valid = typeof result === "object" && result !== null &&
          "success" in result && result.success === true &&
          "hostname" in result && result.hostname === process.env.TURNSTILE_EXPECTED_HOSTNAME;
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) throw error;
      valid = false;
    } finally {
      clearTimeout(timeout);
    }
  }
  return valid;
}

function defaultConfirmationMailer(): (message: ConfirmationEmail) => Promise<void> {
  const host = process.env.MAIL_HOST?.trim() || "";
  const portNumber = Number(process.env.MAIL_PORT || "");
  const from = process.env.MAIL_FROM?.trim() || "";
  const username = process.env.MAIL_USERNAME || "";
  const password = process.env.MAIL_PASSWORD || "";
  if (Boolean(username) !== Boolean(password)) {
    throw new Error("Configure both MAIL_USERNAME and MAIL_PASSWORD.");
  }
  const configured = Boolean(host && Number.isInteger(portNumber) && portNumber > 0 && from);
  let send: (message: ConfirmationEmail) => Promise<void>;
  if (!configured) {
    send = async () => {
      throw new HttpError("Appointment email delivery is not configured.", 503);
    };
  } else {
    const transport = createTransport({
      host,
      port: portNumber,
      secure: process.env.MAIL_SECURE === "true" || portNumber === 465,
      ...(username && password ? { auth: { user: username, pass: password } } : {}),
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
    send = async (message) => {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    };
  }
  return send;
}

function appointmentEmail(email: string, id: string, doctor: DoctorReference, startsAt: string): ConfirmationEmail {
  const cancelUrl = new URL("/", origin);
  cancelUrl.searchParams.set("cancel", id);
  const localTime = new Intl.DateTimeFormat("ro-RO", {
    timeZone,
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(startsAt));
  return {
    to: email,
    subject: "Confirmarea programării - Empatia",
    text: [
      "Programarea ta a fost confirmată.",
      `Medic: ${doctor.name}`,
      `Data și ora: ${localTime}`,
      `ID programare: ${id}`,
      `Pentru anulare, accesează: ${cancelUrl.toString()}`,
    ].join("\n"),
  };
}

function safeReturnAppointment(row: AppointmentRow) {
  const doctor = doctors.find((candidate) => candidate.id === row.doctor_id);
  if (!doctor) throw new Error("Appointment references an unknown clinician.");
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    doctorName: doctor.name,
  };
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  sendConfirmationEmail: (message: ConfirmationEmail) => Promise<void>,
): Promise<void> {
  if (req.method === "GET" && url.pathname === "/api/config") {
    json(res, 200, { turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "" });
  } else if (req.method === "GET" && url.pathname === "/api/doctors") {
    json(res, 200, { doctors });
  } else if (req.method === "GET" && url.pathname === "/api/admin/session") {
    const session = adminSessionFor(req);
    json(res, 200, session ? { admin: true, csrfToken: session.csrfToken } : { admin: false });
  } else if (req.method === "POST" && url.pathname === "/api/admin/login") {
    if (!validateWrite(req)) {
      json(res, 403, { error: "Request origin is not allowed." });
    } else if (!rateLimit(req, "admin-login", 8, 15 * 60 * 1000)) {
      json(res, 429, { error: "Too many attempts. Please try again later." });
    } else {
      const body = await readJson(req);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      let validPassword = false;
      if (adminPasswordHash && password.length >= 12 && password.length <= 1024) {
        const candidate = scryptSync(password, adminPasswordSalt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
        validPassword = safeEqual(candidate, adminPasswordHash);
      }
      const validUsername = configuredAdminUsername !== "" && safeEqual(username, configuredAdminUsername);
      if (!validUsername || !validPassword) {
        json(res, 401, { error: "Utilizator sau parolă incorectă." });
      } else {
        const session = { csrfToken: randomBytes(32).toString("base64url"), expiresAt: Date.now() + sessionLifetime };
        res.setHeader("Set-Cookie", sessionCookie(session));
        json(res, 200, { admin: true });
      }
    }
  } else if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    const session = adminSessionFor(req);
    if (!session) {
      json(res, 401, { error: "Administrator access is required." });
    } else if (!validateWrite(req, session.csrfToken)) {
      json(res, 403, { error: "Request could not be verified." });
    } else {
      res.setHeader("Set-Cookie", expiredSessionCookie());
      json(res, 200, { ok: true });
    }
  } else if (req.method === "GET" && url.pathname === "/api/availability") {
    const doctorId = url.searchParams.get("doctorId") || "";
    const date = url.searchParams.get("date") || "";
    const doctor = doctors.find((candidate) => candidate.id === doctorId);
    if (!doctor) {
      json(res, 400, { error: "Choose a valid clinician." });
    } else if (!parseDate(date)) {
      json(res, 400, { error: "Choose a valid appointment date." });
    } else {
      json(res, 200, { slots: availableSlots(doctorId, date) });
    }
  } else if (req.method === "GET" && url.pathname === "/api/appointments") {
    const session = adminSessionFor(req);
    if (!session) {
      json(res, 401, { error: "Administrator access is required." });
    } else {
      const now = new Date().toISOString();
      completeExpiredAppointments(now);
      const appointments = db.prepare(`
        SELECT id, doctor_id, starts_at, ends_at, status
        FROM appointments
        WHERE status = 'active' AND starts_at >= ?
        ORDER BY starts_at
      `).all(now) as AppointmentRow[];
      json(res, 200, { appointments: appointments.map(safeReturnAppointment) });
    }
  } else if (req.method === "POST" && url.pathname === "/api/appointments") {
    if (!validateWrite(req)) {
      json(res, 403, { error: "Request origin is not allowed." });
    } else if (!rateLimit(req, "booking", 12, 60 * 60 * 1000)) {
      json(res, 429, { error: "Too many booking attempts. Please try again later." });
    } else {
      const body = await readJson(req);
      if ("cnp" in body) {
        json(res, 400, { error: "Send only the hashed CNP." });
      } else if (Object.keys(body).some((key) => !bookingFields.has(key))) {
        json(res, 400, { error: "The booking contains unsupported fields." });
      } else if (typeof body.website === "string" && body.website.length > 0) {
        json(res, 403, { error: "Request could not be verified." });
      } else if (typeof body.cnpHash !== "string" || !/^[0-9a-f]{64}$/.test(body.cnpHash)) {
        json(res, 400, { error: "Enter a valid CNP." });
      } else if (typeof body.email !== "string" || body.email.trim().length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
        json(res, 400, { error: "Enter a valid email address." });
      } else if (typeof body.doctorId !== "string" || typeof body.startsAt !== "string") {
        json(res, 400, { error: "Choose a valid appointment time." });
      } else {
        const doctor = doctors.find((candidate) => candidate.id === body.doctorId);
        if (!doctor) {
          json(res, 400, { error: "Choose a valid clinician." });
        } else {
          const now = new Date().toISOString();
          completeExpiredAppointments(now);
          const patient = db.prepare("SELECT 1 FROM authorized_patients WHERE cnp_hash = ?")
            .get(body.cnpHash) as { 1: number } | undefined;
          const existingAppointment = db.prepare(`
            SELECT 1 FROM appointments
            WHERE cnp_hash = ? AND status IN ('pending', 'active')
          `).get(body.cnpHash) as { 1: number } | undefined;
          const date = body.startsAt.slice(0, 10);
          if (!patient) {
            json(res, 403, { error: "CNP-ul nu este înregistrat la clinică." });
          } else if (existingAppointment) {
            json(res, 409, { error: "Există deja o programare activă pentru acest CNP." });
          } else if (!(await verifyTurnstile(body.turnstileToken, req))) {
            json(res, 400, { error: "Completează verificarea de securitate și încearcă din nou." });
          } else if (!availableSlots(body.doctorId, date).includes(body.startsAt)) {
            json(res, 409, { error: "Ora nu mai este disponibilă. Alege un alt interval." });
          } else {
            const id = randomBytes(32).toString("hex");
            let inserted = false;
            try {
              db.prepare(`
                INSERT INTO appointments (id, cnp_hash, doctor_id, starts_at, ends_at, status, created_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?)
              `).run(
                id,
                body.cnpHash,
                body.doctorId,
                body.startsAt,
                new Date(new Date(body.startsAt).getTime() + 30 * 60 * 1000).toISOString(),
                new Date().toISOString(),
              );
              inserted = true;
            } catch (error) {
              if (error instanceof Error && "code" in error &&
                  (error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.code === "SQLITE_CONSTRAINT_PRIMARYKEY")) {
                json(res, 409, { error: "Ora sau pacientul a fost programat între timp." });
              } else {
                throw error;
              }
            }
            if (inserted) {
              let emailSent = false;
              try {
                await sendConfirmationEmail(appointmentEmail(body.email.trim(), id, doctor, body.startsAt));
                emailSent = true;
              } catch {
                db.prepare("DELETE FROM appointments WHERE id = ? AND status = 'pending'").run(id);
                console.error("Appointment confirmation delivery failed.");
              }
              if (emailSent) {
                db.prepare("UPDATE appointments SET status = 'active' WHERE id = ? AND status = 'pending'").run(id);
                json(res, 201, { ok: true, id });
              } else {
                json(res, 503, { error: "Nu s-a putut trimite e-mailul de confirmare. Programarea nu a fost salvată." });
              }
            }
          }
        }
      }
    }
  } else if (req.method === "POST" && /^\/api\/appointments\/[0-9a-f]{64}\/cancel$/.test(url.pathname)) {
    if (!validateWrite(req)) {
      json(res, 403, { error: "Request origin is not allowed." });
    } else {
      const appointmentId = url.pathname.split("/")[3] || "";
      const now = new Date().toISOString();
      const result = db.prepare(`
        UPDATE appointments SET status = 'cancelled'
        WHERE id = ? AND status = 'active' AND starts_at > ?
      `).run(appointmentId, now);
      if (result.changes !== 1) {
        json(res, 404, { error: "Appointment not found or no longer cancellable." });
      } else {
        json(res, 200, { ok: true });
      }
    }
  } else {
    json(res, 404, { error: "Not found." });
  }
}

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function createAppServer(options: AppServerOptions = {}) {
  const sendConfirmationEmail = options.sendConfirmationEmail || defaultConfirmationMailer();
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url || "/", origin);
    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url, sendConfirmationEmail);
      } else if (req.method !== "GET" && req.method !== "HEAD") {
        json(res, 405, { error: "Method not allowed." });
      } else {
        const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
        const publicDirectory = resolve(root, "public");
        const filePath = resolve(publicDirectory, `.${requestedPath}`);
        if (!filePath.startsWith(publicDirectory + sep)) {
          json(res, 404, { error: "Not found." });
        } else {
          let content: Buffer | undefined;
          try {
            content = readFileSync(filePath);
          } catch (error) {
            if (error instanceof Error && "code" in error &&
                (error.code === "ENOENT" || error.code === "EISDIR")) {
              json(res, 404, { error: "Not found." });
            } else {
              throw error;
            }
          }
          if (content) {
            res.writeHead(200, {
              "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
              "Cache-Control": "no-cache",
              "Content-Security-Policy": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
              "Referrer-Policy": "strict-origin-when-cross-origin",
              "X-Content-Type-Options": "nosniff",
              "X-Frame-Options": "DENY",
              "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
              ...(production ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains" } : {}),
            });
            if (req.method === "HEAD") res.end();
            else res.end(content);
          }
        }
      }
    } catch (error) {
      if (!res.headersSent) {
        const status = error instanceof HttpError ? error.status : 500;
        json(res, status, { error: status < 500 ? errorMessage(error) : "Something went wrong. Please try again." });
      }
      if (!(error instanceof HttpError)) console.error("Request failed:", errorMessage(error));
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAppServer();
  server.listen(port, () => console.log(`Empatia Care is listening on ${origin}`));
}
