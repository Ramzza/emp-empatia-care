import assert from "node:assert/strict";
import { test } from "node:test";
import { apiRequest, hashCnp, jsonRequest, nextWeekday, seedCnp } from "./helpers";

test("PRD-004: only an authenticated administrator can list appointments", async () => {
  const cnp = "9876543210123";
  await seedCnp(cnp);
  assert.equal((await apiRequest("/api/appointments")).status, 401);
  assert.equal((await jsonRequest("/api/admin/login", { username: "clinic-admin", password: "test-admin-password-123" }, { origin: "https://attacker.example" })).status, 403);
  assert.equal((await jsonRequest("/api/admin/login", { username: "clinic-admin", password: "wrong-password-123" })).status, 401);
  const login = await jsonRequest("/api/admin/login", { username: "clinic-admin", password: "test-admin-password-123" });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  const session = await apiRequest("/api/admin/session", "GET", undefined, { cookie }).then((response) => response.json()) as { admin: boolean; csrfToken: string };
  assert.equal(session.admin, true);
  assert.ok(session.csrfToken);
  const doctors = await apiRequest("/api/doctors").then((response) => response.json()) as { doctors: Array<{ id: string }> };
  const doctorId = doctors.doctors[0]?.id || "";
  const availability = await apiRequest(`/api/availability?doctorId=${doctorId}&date=${nextWeekday()}`).then((response) => response.json()) as { slots: string[] };
  assert.equal((await jsonRequest("/api/appointments", { cnpHash: hashCnp(cnp), doctorId, startsAt: availability.slots[0], email: "admin-view@example.test" })).status, 201);
  const agenda = await apiRequest("/api/appointments", "GET", undefined, { cookie }).then((response) => response.json()) as { appointments: Array<Record<string, unknown>> };
  assert.equal(agenda.appointments.length, 1);
  assert.equal("email" in (agenda.appointments[0] || {}), false);
  assert.equal("cnpHash" in (agenda.appointments[0] || {}), false);
  assert.equal((await jsonRequest("/api/admin/logout", {}, { cookie })).status, 403);
  const logout = await jsonRequest("/api/admin/logout", {}, { cookie, csrfToken: session.csrfToken });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);
});
