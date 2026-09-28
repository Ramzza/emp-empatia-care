import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

const testDirectory = mkdtempSync(join(tmpdir(), "empatia-care-"));
process.env.NODE_ENV = "test";
process.env.PUBLIC_ORIGIN = "http://localhost";
process.env.DATABASE_PATH = join(testDirectory, "test.sqlite");
const { createAppServer, db } = await import("../server.js");
const { createUser } = await import("../scripts/create-user.js");
const server = createAppServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("The test server did not bind to a TCP port.");
const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
const password = "Correct-Horse-Battery-7!";

await createUser({ role: "doctor", email: "doctor@example.test", name: "Dr. One" }, password);
await createUser({ role: "doctor", email: "other@example.test", name: "Dr. Two" }, password);
await createUser({ role: "patient", email: "patient@example.test", name: "Alex Patient", doctor: "doctor@example.test" }, password);
await createUser({ role: "patient", email: "stranger@example.test", name: "Sam Stranger", doctor: "other@example.test" }, password);

interface TestSession {
  cookie: string;
  csrfToken: string;
  user: { id: string; role: "doctor" | "patient" };
}

async function login(email: string): Promise<TestSession> {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const session = await fetch(`${baseUrl}/api/session`, { headers: { Cookie: cookie } }).then((r) => r.json());
  assert.ok(typeof session.csrfToken === "string");
  assert.ok(session.user);
  return { cookie, csrfToken: session.csrfToken as string, user: session.user as TestSession["user"] };
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

after(() => {
  server.close();
  db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("PRD-001: invite-only accounts; PRD-002: linked weekday slots and booking; PRD-003: private schedules; PRD-004: protected requests", async () => {
  const landing = await fetch(`${baseUrl}/`);
  assert.equal(landing.status, 200);
  const contentSecurityPolicy = landing.headers.get("content-security-policy");
  assert.ok(contentSecurityPolicy);
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  assert.match(await landing.text(), /Centrul Medical Empatia/);
  const browserApp = await fetch(`${baseUrl}/build/app.js`);
  assert.equal(browserApp.status, 200);
  assert.match(await browserApp.text(), /Programările tale/);

  const patient = await login("patient@example.test");
  const stranger = await login("stranger@example.test");
  const doctor = await login("doctor@example.test");
  const otherDoctor = await login("other@example.test");

  assert.equal(patient.user.role, "patient");
  assert.equal(doctor.user.role, "doctor");

  const unprovisionedLogin = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ email: "unknown@example.test", password }),
  });
  assert.equal(unprovisionedLogin.status, 401);

  const registration = await fetch(`${baseUrl}/api/register`, { method: "POST" });
  assert.equal(registration.status, 404);

  const foreignAvailability = await fetch(
    `${baseUrl}/api/availability?doctorId=${otherDoctor.user.id}&date=${nextWeekday()}`,
    { headers: { Cookie: patient.cookie } },
  );
  assert.equal(foreignAvailability.status, 403);

  const date = nextWeekday();
  const availabilityResponse = await fetch(
    `${baseUrl}/api/availability?doctorId=${doctor.user.id}&date=${date}`,
    { headers: { Cookie: patient.cookie } },
  );
  assert.equal(availabilityResponse.status, 200);
  const { slots } = await availabilityResponse.json();
  assert.ok(slots.length > 0);
  const clinicClock = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Bucharest",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const value of slots as string[]) {
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
    `${baseUrl}/api/availability?doctorId=${doctor.user.id}&date=${nextSaturday()}`,
    { headers: { Cookie: patient.cookie } },
  );
  assert.equal(weekendAvailability.status, 200);
  assert.deepEqual((await weekendAvailability.json()).slots, []);
  const slot = slots[0];
  assert.ok(slot);
  const invalidDate = await fetch(
    `${baseUrl}/api/availability?doctorId=${doctor.user.id}&date=2026-99-99`,
    { headers: { Cookie: patient.cookie } },
  );
  assert.equal(invalidDate.status, 400);

  const rejectedOrigin = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Origin: "https://attacker.example",
      Cookie: patient.cookie,
      "X-CSRF-Token": patient.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slot }),
  });
  assert.equal(rejectedOrigin.status, 403);

  const missingCsrf = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Origin: "http://localhost",
      Cookie: patient.cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slot }),
  });
  assert.equal(missingCsrf.status, 403);

  const botTrap = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Origin: "http://localhost",
      Cookie: patient.cookie,
      "X-CSRF-Token": patient.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slot, website: "spam" }),
  });
  assert.equal(botTrap.status, 403);

  const doctorCannotBook = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Origin: "http://localhost",
      Cookie: doctor.cookie,
      "X-CSRF-Token": doctor.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slot }),
  });
  assert.equal(doctorCannotBook.status, 403);

  const denied = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Origin: "http://localhost",
      Cookie: stranger.cookie,
      "X-CSRF-Token": stranger.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slot }),
  });
  assert.equal(denied.status, 403);

  const booking = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Origin: "http://localhost",
      Cookie: patient.cookie,
      "X-CSRF-Token": patient.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slot }),
  });
  assert.equal(booking.status, 201);

  const duplicate = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Origin: "http://localhost",
      Cookie: patient.cookie,
      "X-CSRF-Token": patient.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slots[0] }),
  });
  assert.equal(duplicate.status, 409);

  const doctorAgenda = await fetch(`${baseUrl}/api/appointments`, { headers: { Cookie: doctor.cookie } })
    .then((response) => response.json());
  assert.equal(doctorAgenda.appointments.length, 1);
  assert.equal(doctorAgenda.appointments[0].patientName, "Alex Patient");

  const patientAgenda = await fetch(`${baseUrl}/api/appointments`, { headers: { Cookie: patient.cookie } })
    .then((response) => response.json());
  assert.equal(patientAgenda.appointments.length, 1);
  assert.equal(patientAgenda.appointments[0].doctorName, "Dr. One");

  const strangerAgenda = await fetch(`${baseUrl}/api/appointments`, { headers: { Cookie: stranger.cookie } })
    .then((response) => response.json());
  assert.equal(strangerAgenda.appointments.length, 0);

  const otherAgenda = await fetch(`${baseUrl}/api/appointments`, { headers: { Cookie: otherDoctor.cookie } })
    .then((response) => response.json());
  assert.equal(otherAgenda.appointments.length, 0);
});
