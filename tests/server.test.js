import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

const testDirectory = mkdtempSync(join(tmpdir(), "empatia-care-"));
process.env.NODE_ENV = "test";
process.env.PUBLIC_ORIGIN = "http://localhost";
process.env.DATABASE_PATH = join(testDirectory, "test.sqlite");
const { createAppServer, db } = await import("../server.js");
const { createUser } = await import("../scripts/create-user.js");
const server = createAppServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const password = "Correct-Horse-Battery-7!";

await createUser({ role: "doctor", email: "doctor@example.test", name: "Dr. One" }, password);
await createUser({ role: "doctor", email: "other@example.test", name: "Dr. Two" }, password);
await createUser({ role: "patient", email: "patient@example.test", name: "Alex Patient", doctor: "doctor@example.test" }, password);
await createUser({ role: "patient", email: "stranger@example.test", name: "Sam Stranger", doctor: "other@example.test" }, password);

async function login(email) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const session = await fetch(`${baseUrl}/api/session`, { headers: { Cookie: cookie } }).then((r) => r.json());
  return { cookie, csrfToken: session.csrfToken, user: session.user };
}

function nextWeekday() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

after(() => {
  server.close();
  db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("only provisioned patients can book with a linked clinician; clinicians see their own patient schedule", async () => {
  const landing = await fetch(`${baseUrl}/`);
  assert.equal(landing.status, 200);
  assert.match(landing.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(await landing.text(), /Centrul Medical Empatia/);

  const patient = await login("patient@example.test");
  const stranger = await login("stranger@example.test");
  const doctor = await login("doctor@example.test");
  const otherDoctor = await login("other@example.test");

  assert.equal(patient.user.role, "patient");
  assert.equal(doctor.user.role, "doctor");

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

  const rejectedOrigin = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Origin: "https://attacker.example",
      Cookie: patient.cookie,
      "X-CSRF-Token": patient.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slots[0] }),
  });
  assert.equal(rejectedOrigin.status, 403);

  const botTrap = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      Origin: "http://localhost",
      Cookie: patient.cookie,
      "X-CSRF-Token": patient.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slots[0], website: "spam" }),
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
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slots[0] }),
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
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slots[0] }),
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
    body: JSON.stringify({ doctorId: doctor.user.id, startsAt: slots[0] }),
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
