import { createServer as createHttpServer } from "node:http";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000);
const origin = process.env.PUBLIC_ORIGIN || `http://localhost:${port}`;
const appSecret = process.env.APP_SECRET || "local-development-key-not-for-production";
const cookieName = "empatia_session";
const sessionLifetime = 12 * 60 * 60 * 1000;
const timeZone = "Europe/Bucharest";
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const rateLimits = new Map();

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
}

const databasePath = resolve(process.env.DATABASE_PATH || resolve(root, "data/empatia.sqlite"));
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new Database(databasePath, { timeout: 5000 });
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('doctor', 'patient')),
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS doctor_patients (
    doctor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (doctor_id, patient_id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    doctor_id TEXT NOT NULL REFERENCES users(id),
    patient_id TEXT NOT NULL REFERENCES users(id),
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked')),
    created_at TEXT NOT NULL,
    UNIQUE (doctor_id, starts_at)
  );
  CREATE INDEX IF NOT EXISTS appointments_patient_time_idx ON appointments(patient_id, starts_at);
  CREATE INDEX IF NOT EXISTS appointments_doctor_time_idx ON appointments(doctor_id, starts_at);
`);

export function passwordRecord(password, salt = randomBytes(16).toString("hex")) {
  const passwordHash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt, passwordHash };
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

function requestIp(req) {
  return req.socket.remoteAddress || "unknown";
}

function rateLimit(req, key, max, windowMs) {
  const ipDigest = createHmac("sha256", appSecret).update(requestIp(req)).digest("hex");
  const bucketKey = `${key}:${ipDigest}`;
  const now = Date.now();
  if (rateLimits.size > 5000) {
    for (const [candidate, entry] of rateLimits) {
      if (entry.resetAt <= now) rateLimits.delete(candidate);
    }
    while (rateLimits.size > 5000) rateLimits.delete(rateLimits.keys().next().value);
  }
  const previous = rateLimits.get(bucketKey);
  if (!previous || previous.resetAt <= now) {
    rateLimits.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  previous.count += 1;
  return previous.count <= max;
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) {
      const error = new Error("Request body too large.");
      error.status = 413;
      throw error;
    }
  }
  try {
    const value = JSON.parse(body || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    const error = new Error("Invalid JSON request.");
    error.status = 400;
    throw error;
  }
}

function requestCookie(req, name) {
  const cookies = req.headers.cookie || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function tokenDigest(token) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionFor(req) {
  const token = requestCookie(req, cookieName);
  if (!token) return null;
  const session = db.prepare(`
    SELECT s.token_hash, s.csrf_token, s.expires_at, u.id, u.email, u.name, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenDigest(token), Date.now());
  return session || null;
}

function requireSession(req, res) {
  const session = sessionFor(req);
  if (!session) {
    json(res, 401, { error: "Sign in to continue." });
    return null;
  }
  return session;
}

function validateWrite(req, session = null) {
  if (req.headers.origin !== origin) return false;
  if (!session) return true;
  const csrf = req.headers["x-csrf-token"];
  return typeof csrf === "string" && safeEqual(csrf, session.csrf_token);
}

function parseDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return parsed.toISOString().slice(0, 10) === date ? parsed : null;
}

function localDateTimeToUtc(date, time) {
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

export function availableSlots(doctorId, date) {
  const parsed = parseDate(date);
  if (!parsed || parsed.getUTCDay() === 0 || parsed.getUTCDay() === 6) return [];
  const slots = [];
  for (let minute = 9 * 60; minute < 17 * 60; minute += 30) {
    const hour = String(Math.floor(minute / 60)).padStart(2, "0");
    const mins = String(minute % 60).padStart(2, "0");
    const startsAt = localDateTimeToUtc(date, `${hour}:${mins}`);
    if (startsAt.getTime() <= Date.now()) continue;
    const startIso = startsAt.toISOString();
    const booked = db.prepare("SELECT 1 FROM appointments WHERE doctor_id = ? AND starts_at = ?").get(doctorId, startIso);
    if (!booked) slots.push(startIso);
  }
  return slots;
}

function linkedDoctor(doctorId, patientId) {
  return db.prepare(`
    SELECT u.id, u.name FROM users u
    JOIN doctor_patients dp ON dp.doctor_id = u.id
    WHERE u.id = ? AND dp.patient_id = ? AND u.role = 'doctor'
  `).get(doctorId, patientId);
}

async function verifyTurnstile(token, req) {
  if (!production && process.env.NODE_ENV !== "production") return true;
  if (typeof token !== "string" || token.length < 1 || token.length > 2048) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: requestIp(req),
    });
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true &&
      result.hostname === process.env.TURNSTILE_EXPECTED_HOSTNAME;
  } catch (error) {
    if (error.name === "AbortError") return false;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function safeReturnAppointment(row) {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    patientName: row.patient_name,
    doctorName: row.doctor_name,
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/config") {
    return json(res, 200, { turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "" });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    if (!validateWrite(req)) return json(res, 403, { error: "Request origin is not allowed." });
    if (!rateLimit(req, "login", 8, 15 * 60 * 1000)) {
      return json(res, 429, { error: "Too many attempts. Please try again later." });
    }
    const body = await readJson(req);
    if (typeof body.email !== "string" || typeof body.password !== "string") {
      return json(res, 400, { error: "Enter your email and password." });
    }
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(body.email.trim().toLowerCase());
    const candidate = passwordRecord(body.password, user?.salt || "invalid-user-salt");
    if (!user || !safeEqual(candidate.passwordHash, user.password_hash)) {
      return json(res, 401, { error: "Email or password is incorrect." });
    }
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + sessionLifetime;
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
    db.prepare("INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)")
      .run(tokenDigest(token), user.id, csrfToken, expiresAt);
    const options = [
      `${cookieName}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      `Max-Age=${Math.floor(sessionLifetime / 1000)}`,
    ];
    if (production) options.push("Secure");
    res.setHeader("Set-Cookie", options.join("; "));
    return json(res, 200, { user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    const session = sessionFor(req);
    if (!session) return json(res, 200, { user: null });
    const user = { id: session.id, email: session.email, name: session.name, role: session.role };
    const doctors = session.role === "patient"
      ? db.prepare(`
          SELECT u.id, u.name FROM users u
          JOIN doctor_patients dp ON dp.doctor_id = u.id
          WHERE dp.patient_id = ? ORDER BY u.name
        `).all(session.id)
      : [];
    return json(res, 200, { user, csrfToken: session.csrf_token, doctors });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const session = requireSession(req, res);
    if (!session) return;
    if (!validateWrite(req, session)) return json(res, 403, { error: "Request could not be verified." });
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(session.token_hash);
    const expired = [`${cookieName}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
    if (production) expired.push("Secure");
    res.setHeader("Set-Cookie", expired.join("; "));
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/appointments") {
    const session = requireSession(req, res);
    if (!session) return;
    const appointments = session.role === "doctor"
      ? db.prepare(`
          SELECT a.*, p.name AS patient_name, d.name AS doctor_name
          FROM appointments a JOIN users p ON p.id = a.patient_id
          JOIN users d ON d.id = a.doctor_id
          WHERE a.doctor_id = ? AND a.starts_at >= ?
          ORDER BY a.starts_at
        `).all(session.id, new Date().toISOString())
      : db.prepare(`
          SELECT a.*, p.name AS patient_name, d.name AS doctor_name
          FROM appointments a JOIN users p ON p.id = a.patient_id
          JOIN users d ON d.id = a.doctor_id
          WHERE a.patient_id = ? AND a.starts_at >= ?
          ORDER BY a.starts_at
        `).all(session.id, new Date().toISOString());
    return json(res, 200, { appointments: appointments.map(safeReturnAppointment) });
  }

  if (req.method === "GET" && url.pathname === "/api/availability") {
    const session = requireSession(req, res);
    if (!session) return;
    if (session.role !== "patient") return json(res, 403, { error: "Patient access is required." });
    const doctorId = url.searchParams.get("doctorId") || "";
    const date = url.searchParams.get("date") || "";
    if (!linkedDoctor(doctorId, session.id)) return json(res, 403, { error: "You are not registered with this clinician." });
    if (!parseDate(date)) return json(res, 400, { error: "Choose a valid appointment date." });
    return json(res, 200, { slots: availableSlots(doctorId, date) });
  }

  if (req.method === "POST" && url.pathname === "/api/appointments") {
    const session = requireSession(req, res);
    if (!session) return;
    if (!validateWrite(req, session)) return json(res, 403, { error: "Request could not be verified." });
    if (session.role !== "patient") return json(res, 403, { error: "Patient access is required." });
    if (!rateLimit(req, "booking", 6, 60 * 60 * 1000)) {
      return json(res, 429, { error: "Too many booking attempts. Please try again later." });
    }
    const body = await readJson(req);
    if (typeof body.website === "string" && body.website.length > 0) {
      return json(res, 403, { error: "Request could not be verified." });
    }
    if (!linkedDoctor(body.doctorId, session.id)) {
      return json(res, 403, { error: "You are not registered with this clinician." });
    }
    if (!(await verifyTurnstile(body.turnstileToken, req))) {
      return json(res, 400, { error: "Complete the bot-protection check and try again." });
    }
    const validStart = typeof body.startsAt === "string" &&
      availableSlots(body.doctorId, body.startsAt.slice(0, 10)).includes(body.startsAt);
    if (!validStart) return json(res, 409, { error: "That time is unavailable. Choose another slot." });
    const start = new Date(body.startsAt);
    if (Number.isNaN(start.getTime())) return json(res, 400, { error: "Choose a valid appointment time." });
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const id = randomBytes(16).toString("hex");
    try {
      db.prepare(`
        INSERT INTO appointments (id, doctor_id, patient_id, starts_at, ends_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, body.doctorId, session.id, start.toISOString(), end.toISOString(), new Date().toISOString());
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return json(res, 409, { error: "That time was just booked. Choose another slot." });
      }
      throw error;
    }
    return json(res, 201, { ok: true, id });
  }

  return json(res, 404, { error: "Not found." });
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function createAppServer() {
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url || "/", origin);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "Method not allowed." });
      const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
      const filePath = resolve(root, "public", `.${requestedPath}`);
      if (!filePath.startsWith(resolve(root, "public") + sep)) return json(res, 404, { error: "Not found." });
      const { readFileSync } = await import("node:fs");
      let content;
      try {
        content = readFileSync(filePath);
      } catch (error) {
        if (error.code === "ENOENT" || error.code === "EISDIR") return json(res, 404, { error: "Not found." });
        throw error;
      }
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
      if (req.method === "HEAD") return res.end();
      return res.end(content);
    } catch (error) {
      if (!res.headersSent) {
        json(res, error.status || 500, { error: error.status ? error.message : "Something went wrong. Please try again." });
      }
      if (!error.status) console.error("Request failed:", error.message);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createAppServer();
  server.listen(port, () => console.log(`Empatia Care is listening on ${origin}`));
}
