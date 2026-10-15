import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";

const folder = mkdtempSync(join(tmpdir(), "empatia-next-"));
let child: ChildProcess | undefined;
let baseUrl = "";
let serverLogs = "";

async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port.");
  await new Promise<void>((resolveClose, reject) => probe.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

before(async () => {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port),
  ], {
    env: {
      ...process.env, NODE_ENV: "production", PORT: String(port),
      PUBLIC_ORIGIN: `https://localhost:${port}`, APP_SECRET: "test-secret-that-is-long-enough-for-local-testing",
      ADMIN_USERNAME: "clinic-admin", ADMIN_PASSWORD: "test-admin-password-123",
      TURNSTILE_SITE_KEY: "test-site-key", TURNSTILE_SECRET_KEY: "test-secret-key",
      TURNSTILE_EXPECTED_HOSTNAME: "localhost", MAIL_HOST: "127.0.0.1", MAIL_PORT: "1025",
      MAIL_USERNAME: "test", MAIL_PASSWORD: "test", MAIL_FROM: "no-reply@example.test",
      DATABASE_PATH: join(folder, "test.sqlite"), NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const collectLogs = (chunk: Buffer) => { serverLogs += chunk.toString(); };
  child.once("error", (error) => { serverLogs += `${error.message}\n`; });
  child.stdout?.on("data", collectLogs);
  child.stderr?.on("data", collectLogs);
  let ready = false;
  for (let attempt = 0; attempt < 80 && !ready && child.exitCode === null; attempt += 1) {
    try {
      ready = (await fetch(baseUrl)).ok;
    } catch {
      await delay(250);
    }
  }
  assert.ok(ready, `Next.js server did not start. ${serverLogs}`);
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  rmSync(folder, { recursive: true, force: true });
});

test("PRD-006: Next.js serves the React portal pages with framing protection", async () => {
  const home = await fetch(baseUrl);
  const html = await home.text();
  assert.equal(home.status, 200);
  assert.match(html, /Grija începe/);
  assert.match(home.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.equal(home.headers.get("x-frame-options"), "DENY");
  const [booking, admin, doctors] = await Promise.all([
    fetch(`${baseUrl}/book`),
    fetch(`${baseUrl}/admin`),
    fetch(`${baseUrl}/api/doctors`),
  ]);
  assert.match(await booking.text(), /Confirmă programarea/);
  assert.match(await admin.text(), /Programări active/);
  assert.deepEqual((await doctors.json() as { doctors: unknown[] }).doctors.length, 2);
});
