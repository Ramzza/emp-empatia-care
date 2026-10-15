import assert from "node:assert/strict";
import { test } from "node:test";
import { apiRequest, hashCnp, jsonRequest, nextSaturday, nextWeekday, seedCnp } from "./helpers";

test("PRD-002: authorized patients book one future clinic slot with a required email", async () => {
  const cnp = "1234567890123";
  await seedCnp(cnp);
  const doctors = await apiRequest("/api/doctors").then((response) => response.json()) as { doctors: Array<{ id: string }> };
  const doctorId = doctors.doctors[0]?.id || "";
  const date = nextWeekday();
  const availability = await apiRequest(`/api/availability?doctorId=${doctorId}&date=${date}`).then((response) => response.json()) as { slots: string[] };
  assert.ok(availability.slots.length > 1);
  const times = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Bucharest", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const slot of availability.slots) {
    const parts = times.formatToParts(new Date(slot));
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    assert.ok(new Date(slot).getTime() > Date.now());
    assert.ok(["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday || ""));
    assert.ok(hour * 60 + minute >= 540 && hour * 60 + minute < 1020 && minute % 30 === 0);
  }
  const weekend = await apiRequest(`/api/availability?doctorId=${doctorId}&date=${nextSaturday()}`).then((response) => response.json()) as { slots: string[] };
  assert.deepEqual(weekend.slots, []);
  assert.equal((await apiRequest(`/api/availability?doctorId=${doctorId}&date=2026-99-99`)).status, 400);
  const slot = availability.slots[0] || "";
  assert.equal((await jsonRequest("/api/appointments", { cnpHash: hashCnp("1111111111111"), doctorId, startsAt: slot, email: "a@example.test" })).status, 403);
  assert.equal((await jsonRequest("/api/appointments", { cnpHash: hashCnp(cnp), doctorId, startsAt: slot, email: "patient@example.test" })).status, 201);
  await seedCnp("2222222222222");
  assert.equal((await jsonRequest("/api/appointments", { cnpHash: hashCnp("2222222222222"), doctorId, startsAt: slot, email: "other@example.test" })).status, 409);
  assert.equal((await jsonRequest("/api/appointments", { cnpHash: hashCnp(cnp), doctorId, startsAt: availability.slots[1], email: "patient@example.test" })).status, 409);
  assert.equal((await jsonRequest("/api/appointments", { cnpHash: hashCnp(cnp), doctorId, startsAt: availability.slots[2] })).status, 400);
});
