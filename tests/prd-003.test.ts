import assert from "node:assert/strict";
import { test } from "node:test";
import { apiRequest, db, hashCnp, jsonRequest, nextWeekday, seedCnp, sentEmails, setFailEmailDelivery } from "./helpers";

test("PRD-003: email includes the cancellation link and cancellation releases the appointment", async () => {
  const cnp = "9876543210987";
  await seedCnp(cnp);
  const doctors = await apiRequest("/api/doctors").then((response) => response.json()) as { doctors: Array<{ id: string }> };
  const doctorId = doctors.doctors[0]?.id || "";
  const availability = await apiRequest(`/api/availability?doctorId=${doctorId}&date=${nextWeekday()}`).then((response) => response.json()) as { slots: string[] };
  const booking = await jsonRequest("/api/appointments", { cnpHash: hashCnp(cnp), doctorId, startsAt: availability.slots[0], email: "patient@example.test" });
  assert.equal(booking.status, 201);
  const { id } = await booking.json() as { id: string };
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0]?.to, "patient@example.test");
  assert.match(sentEmails[0]?.text || "", new RegExp(`/cancel/${id}`));
  assert.doesNotMatch(sentEmails[0]?.text || "", new RegExp(cnp));
  assert.doesNotMatch(sentEmails[0]?.text || "", new RegExp(hashCnp(cnp)));
  assert.equal((await jsonRequest(`/api/appointments/${id}/cancel`, {})).status, 200);
  assert.equal((db.prepare("SELECT status FROM appointments WHERE id=?").get(id) as { status: string }).status, "cancelled");
});

test("PRD-003: mail delivery failure removes the pending appointment", async () => {
  const cnp = "9876543210115";
  await seedCnp(cnp);
  const doctors = await apiRequest("/api/doctors").then((response) => response.json()) as { doctors: Array<{ id: string }> };
  const doctorId = doctors.doctors[0]?.id || "";
  const slots = await apiRequest(`/api/availability?doctorId=${doctorId}&date=${nextWeekday()}`).then((response) => response.json()) as { slots: string[] };
  setFailEmailDelivery(true);
  const result = await jsonRequest("/api/appointments", { cnpHash: hashCnp(cnp), doctorId, startsAt: slots.slots[0], email: "failure@example.test" });
  setFailEmailDelivery(false);
  assert.equal(result.status, 503);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE cnp_hash=?").get(hashCnp(cnp)) as { count: number }).count, 0);
});
