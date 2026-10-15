import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, test } from "node:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

const testDirectory = mkdtempSync(join(tmpdir(), "empatia-care-"));
process.env.NODE_ENV = "test";
process.env.PUBLIC_ORIGIN = "http://localhost";
process.env.APP_SECRET = "test-secret-that-is-long-enough-for-local-testing";
process.env.ADMIN_USERNAME = "clinic-admin";
process.env.ADMIN_PASSWORD = "test-admin-password-123";
process.env.DATABASE_PATH = join(testDirectory, "test.sqlite");
const { createAppServer, db } = await import("../server.js");
const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
let failEmailDelivery = false;
const server = createAppServer({
  sendConfirmationEmail: async (message) => {
    if (failEmailDelivery) throw new Error("SMTP delivery failed.");
    sentEmails.push(message);
  },
});
server.listen(0, "0.0.0.0");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("The test server did not bind to a TCP port.");
const serverPort = (address as AddressInfo).port;
let clientAddress = "127.0.0.1";
const testCnp = "1234567890123";
const testEmail = "patient@example.test";
const importerUrl = new URL("../scripts/import-cnps.js", import.meta.url);

function serverUrl(path: string): string {
  return `http://${clientAddress}:${serverPort}${path}`;
}

function hashCnp(cnp: string): string {
  return createHash("sha256").update(cnp).digest("hex");
}

async function importCnp(cnp: string): Promise<void> {
  assert.ok(existsSync(importerUrl), "The CSV CNP importer must be built.");
  const importer = await import(importerUrl.href) as {
    importCnpCsvText(csv: string): number;
  };
  importer.importCnpCsvText(`cnp\n${cnp}\n`);
}

function nextWeekday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nextSaturday(): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function jsonRequest(path: string, body: unknown, options: {
  origin?: string;
  cookie?: string;
  csrfToken?: string;
} = {}): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json", Origin: options.origin ?? "http://localhost" });
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.csrfToken) headers.set("X-CSRF-Token", options.csrfToken);
  return fetch(serverUrl(path), { method: "POST", headers, body: JSON.stringify(body) });
}

after(() => {
  server.close();
  db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("PRD-001: only appointment and hashed-CNP tables remain; the browser hashes CNP locally", async () => {
  clientAddress = "127.0.0.1";
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  assert.deepEqual(tables.map((table) => table.name), ["appointments", "authorized_patients"]);
  const patientColumns = db.pragma("table_info(authorized_patients)") as Array<{ name: string }>;
  assert.deepEqual(patientColumns.map((column) => column.name), ["cnp_hash"]);
  const appointmentColumns = db.pragma("table_info(appointments)") as Array<{ name: string }>;
  assert.deepEqual(
    appointmentColumns.map((column) => column.name),
    ["id", "cnp_hash", "doctor_id", "starts_at", "ends_at", "status", "created_at"],
  );
  const browserApp = await fetch(serverUrl("/build/app.js")).then((response) => response.text());
  assert.match(browserApp, /hashCnp/);
  assert.match(browserApp, /cnpHash/);
  assert.doesNotMatch(browserApp, /localStorage/);
  const browserCnp = await fetch(serverUrl("/build/cnp.js"));
  assert.equal(browserCnp.status, 200);
  assert.match(await browserCnp.text(), /SHA-256/);
});

test("PRD-002: CSV-authorized CNP hashes can book one future clinic slot with a required email", async () => {
  clientAddress = "127.0.0.2";
  await importCnp(testCnp);
  const doctorsResponse = await fetch(serverUrl("/api/doctors"));
  assert.equal(doctorsResponse.status, 200);
  const { doctors } = await doctorsResponse.json() as { doctors: Array<{ id: string }> };
  assert.ok(doctors.length > 0);
  const doctorId = doctors[0]?.id;
  assert.ok(doctorId);
  const availability = await fetch(
    serverUrl(`/api/availability?doctorId=${encodeURIComponent(doctorId)}&date=${nextWeekday()}`),
  );
  assert.equal(availability.status, 200);
  const { slots } = await availability.json() as { slots: string[] };
  assert.ok(slots.length > 0);
  const clinicClock = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Bucharest",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const value of slots) {
    assert.ok(new Date(value).getTime() > Date.now());
    const parts = clinicClock.formatToParts(new Date(value));
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    assert.ok(["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday ?? ""));
    assert.ok(hour * 60 + minute >= 9 * 60 && hour * 60 + minute < 17 * 60);
    assert.equal(minute % 30, 0);
  }
  const weekendAvailability = await fetch(
    serverUrl(`/api/availability?doctorId=${encodeURIComponent(doctorId)}&date=${nextSaturday()}`),
  );
  assert.equal(weekendAvailability.status, 200);
  assert.deepEqual((await weekendAvailability.json() as { slots: string[] }).slots, []);
  const invalidDate = await fetch(
    serverUrl(`/api/availability?doctorId=${encodeURIComponent(doctorId)}&date=2026-99-99`),
  );
  assert.equal(invalidDate.status, 400);

  const unlisted = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp("1111111111111"),
    doctorId,
    startsAt: slots[0],
    email: testEmail,
  });
  assert.equal(unlisted.status, 403);

  const booking = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(testCnp),
    doctorId,
    startsAt: slots[0],
    email: testEmail,
  });
  assert.equal(booking.status, 201);
  const { id } = await booking.json() as { id: string };

  const slotConflictCnp = "2222222222222";
  await importCnp(slotConflictCnp);
  const duplicateForSlot = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(slotConflictCnp),
    doctorId,
    startsAt: slots[0],
    email: "another@example.test",
  });
  assert.equal(duplicateForSlot.status, 409);

  const duplicateForPatient = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(testCnp),
    doctorId,
    startsAt: slots[1],
    email: testEmail,
  });
  assert.equal(duplicateForPatient.status, 409);

  const missingEmail = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(testCnp),
    doctorId,
    startsAt: slots[2],
  });
  assert.equal(missingEmail.status, 400);

  const appointmentCount = db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE cnp_hash = ?")
    .get(hashCnp(testCnp)) as { count: number };
  assert.equal(appointmentCount.count, 1);
  const appointmentColumns = db.pragma("table_info(appointments)") as Array<{ name: string }>;
  assert.equal(appointmentColumns.some((column) => column.name === "email"), false);
  assert.equal((await jsonRequest(`/api/appointments/${id}/cancel`, {})).status, 200);
});

test("PRD-003: confirmation email contains the appointment-ID cancellation link; cancellation releases the booking", async () => {
  clientAddress = "127.0.0.3";
  const cnp = "9876543210987";
  await importCnp(cnp);
  const doctorsResponse = await fetch(serverUrl("/api/doctors"));
  assert.equal(doctorsResponse.status, 200);
  const { doctors } = await doctorsResponse.json() as { doctors: Array<{ id: string }> };
  const doctorId = doctors[0]?.id;
  assert.ok(doctorId);
  const date = nextWeekday();
  const availability = await fetch(
    serverUrl(`/api/availability?doctorId=${encodeURIComponent(doctorId)}&date=${date}`),
  ).then((response) => response.json()) as { slots: string[] };
  const booking = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(cnp),
    doctorId,
    startsAt: availability.slots[0],
    email: testEmail,
  });
  assert.equal(booking.status, 201);
  const { id } = await booking.json() as { id: string };
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.equal(sentEmails.length, 2);
  const confirmation = sentEmails[1];
  assert.equal(confirmation?.to, testEmail);
  assert.match(confirmation?.text ?? "", new RegExp(encodeURIComponent(id)));
  assert.match(confirmation?.text ?? "", /cancel/i);
  assert.doesNotMatch(confirmation?.text ?? "", new RegExp(cnp));
  assert.doesNotMatch(confirmation?.text ?? "", new RegExp(hashCnp(cnp)));

  const cancellation = await jsonRequest(`/api/appointments/${id}/cancel`, {});
  assert.equal(cancellation.status, 200);
  const cancelled = db.prepare("SELECT status FROM appointments WHERE id = ?").get(id) as { status: string };
  assert.equal(cancelled.status, "cancelled");

  const failedCnp = "9876543210115";
  await importCnp(failedCnp);
  const availableAgain = await fetch(
    serverUrl(`/api/availability?doctorId=${encodeURIComponent(doctorId)}&date=${date}`),
  ).then((response) => response.json()) as { slots: string[] };
  failEmailDelivery = true;
  const failedBooking = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(failedCnp),
    doctorId,
    startsAt: availableAgain.slots[0],
    email: "failure@example.test",
  });
  failEmailDelivery = false;
  assert.equal(failedBooking.status, 503);
  const failedAppointmentCount = db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE cnp_hash = ?")
    .get(hashCnp(failedCnp)) as { count: number };
  assert.equal(failedAppointmentCount.count, 0);
});

test("PRD-004: only an authenticated admin can list active appointments", async () => {
  clientAddress = "127.0.0.4";
  const cnp = "9876543210123";
  await importCnp(cnp);
  const adminPage = await fetch(serverUrl("/")).then((response) => response.text());
  assert.match(adminPage, /data-open-admin/);
  assert.match(adminPage, /data-admin-only/);
  assert.match(adminPage, /Programări active/);
  const privateList = await fetch(serverUrl("/api/appointments"));
  assert.equal(privateList.status, 401);

  const rejectedOrigin = await jsonRequest("/api/admin/login", {
    username: "clinic-admin",
    password: "test-admin-password-123",
  }, { origin: "https://attacker.example" });
  assert.equal(rejectedOrigin.status, 403);
  const rejectedPassword = await jsonRequest("/api/admin/login", {
    username: "clinic-admin",
    password: "wrong-password-123",
  });
  assert.equal(rejectedPassword.status, 401);
  const login = await jsonRequest("/api/admin/login", {
    username: "clinic-admin",
    password: "test-admin-password-123",
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const session = await fetch(serverUrl("/api/admin/session"), { headers: { Cookie: cookie } })
    .then((response) => response.json()) as { csrfToken: string; admin: boolean };
  assert.equal(session.admin, true);
  assert.ok(session.csrfToken);

  const doctors = await fetch(serverUrl("/api/doctors")).then((response) => response.json()) as {
    doctors: Array<{ id: string }>;
  };
  const doctorId = doctors.doctors[0]?.id;
  assert.ok(doctorId);
  const slots = await fetch(
    serverUrl(`/api/availability?doctorId=${encodeURIComponent(doctorId)}&date=${nextWeekday()}`),
  ).then((response) => response.json()) as { slots: string[] };
  const booking = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(cnp),
    doctorId,
    startsAt: slots.slots[0],
    email: "admin-view@example.test",
  });
  assert.equal(booking.status, 201);

  const agenda = await fetch(serverUrl("/api/appointments"), { headers: { Cookie: cookie } })
    .then((response) => response.json()) as { appointments: Array<Record<string, unknown>> };
  assert.equal(agenda.appointments.length, 1);
  assert.equal("email" in (agenda.appointments[0] ?? {}), false);
  assert.equal("cnpHash" in (agenda.appointments[0] ?? {}), false);

  const rejectedLogout = await jsonRequest("/api/admin/logout", {}, { cookie });
  assert.equal(rejectedLogout.status, 403);
  const logout = await jsonRequest("/api/admin/logout", {}, {
    cookie,
    csrfToken: session.csrfToken,
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
  const loggedOutSession = await fetch(serverUrl("/api/admin/session")).then((response) => response.json()) as {
    admin: boolean;
  };
  assert.equal(loggedOutSession.admin, false);
});

test("PRD-005: booking writes require same-origin, reject raw CNPs, and enforce the honeypot", async () => {
  clientAddress = "127.0.0.5";
  const landing = await fetch(serverUrl("/"));
  assert.equal(landing.status, 200);
  assert.match(landing.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const foreignOrigin = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(testCnp),
    doctorId: "darko",
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    email: testEmail,
  }, { origin: "https://attacker.example" });
  assert.equal(foreignOrigin.status, 403);

  const rawCnp = await jsonRequest("/api/appointments", {
    cnp: testCnp,
    doctorId: "darko",
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    email: testEmail,
  });
  assert.equal(rawCnp.status, 400);

  const unexpectedField = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(testCnp),
    cnpValue: testCnp,
    doctorId: "darko",
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    email: testEmail,
  });
  assert.equal(unexpectedField.status, 400);

  const botTrap = await jsonRequest("/api/appointments", {
    cnpHash: hashCnp(testCnp),
    doctorId: "darko",
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    email: testEmail,
    website: "spam",
  });
  assert.equal(botTrap.status, 403);

  let finalRateLimitedStatus = 0;
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const response = await jsonRequest("/api/appointments", {
      cnpHash: hashCnp(testCnp),
      doctorId: "darko",
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      email: testEmail,
      website: "spam",
    });
    finalRateLimitedStatus = response.status;
  }
  assert.equal(finalRateLimitedStatus, 429);
});
