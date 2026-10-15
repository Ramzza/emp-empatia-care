import { randomBytes } from "node:crypto";

export const doctors = [
  { id: "darko", name: "Dr. Darkó Zsuzsanna" },
  { id: "lorenzovici", name: "Dr. Lorenzovici Anna" },
];
export const cookieName = "empatia_admin";
export const sessionLifetime = 12 * 60 * 60 * 1000;
export const pendingLifetime = 10 * 60 * 1000;
export const timeZone = "Europe/Bucharest";
export const newSession = () => ({
  csrfToken: randomBytes(32).toString("base64url"),
  expiresAt: Date.now() + sessionLifetime,
});

export function appOrigin(): string {
  const port = Number(process.env.PORT || 3000);
  return process.env.PUBLIC_ORIGIN || `http://localhost:${port}`;
}

export function assertProductionConfig(): void {
  if (process.env.NODE_ENV === "production") {
    const username = process.env.ADMIN_USERNAME?.trim() || "";
    const password = process.env.ADMIN_PASSWORD || "";
    const mailPort = Number(process.env.MAIL_PORT);
    const mailConfigured = Boolean(
      process.env.MAIL_HOST && process.env.MAIL_PORT && process.env.MAIL_FROM &&
      process.env.MAIL_USERNAME && process.env.MAIL_PASSWORD,
    );
    if (!process.env.APP_SECRET || Buffer.byteLength(process.env.APP_SECRET) < 32) {
      throw new Error("Production requires APP_SECRET with at least 32 bytes.");
    }
    if (!process.env.PUBLIC_ORIGIN?.startsWith("https://")) {
      throw new Error("Production requires an HTTPS PUBLIC_ORIGIN.");
    }
    if (!process.env.TURNSTILE_SITE_KEY || !process.env.TURNSTILE_SECRET_KEY ||
        !process.env.TURNSTILE_EXPECTED_HOSTNAME) {
      throw new Error("Production requires Turnstile site key, secret key, and expected hostname.");
    }
    if (!username || username.length > 120 || password.length < 12 || password.length > 1024) {
      throw new Error("Production requires valid administrator credentials.");
    }
    if (!mailConfigured || !Number.isInteger(mailPort) || mailPort < 1 || mailPort > 65535) {
      throw new Error("Production requires valid SMTP settings.");
    }
  }
}
