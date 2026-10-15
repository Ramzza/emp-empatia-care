import assert from "node:assert/strict";
import { test } from "node:test";
import { hashCnp, jsonRequest } from "./helpers";

test("PRD-005: booking writes are same-origin, hashed-only, honeypot-protected, and rate-limited", async () => {
  const body = { cnpHash: hashCnp("1234567890123"), doctorId: "darko", startsAt: new Date(Date.now() + 86_400_000).toISOString(), email: "patient@example.test" };
  assert.equal((await jsonRequest("/api/appointments", body, { origin: "https://attacker.example", ip: "foreign" })).status, 403);
  assert.equal((await jsonRequest("/api/appointments", { ...body, cnp: "1234567890123" }, { ip: "raw-cnp" })).status, 400);
  assert.equal((await jsonRequest("/api/appointments", { ...body, extra: "private" }, { ip: "extra-field" })).status, 400);
  assert.equal((await jsonRequest("/api/appointments", { ...body, website: "spam" }, { ip: "honeypot" })).status, 403);
  let status = 0;
  for (let attempt = 0; attempt < 13; attempt += 1) {
    status = (await jsonRequest("/api/appointments", { ...body, website: "spam" }, { ip: "rate-limit" })).status;
  }
  assert.equal(status, 429);
});
