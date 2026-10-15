import { createHmac } from "node:crypto";
import { cookieName, sessionLifetime } from "../config";
import type { AdminSession } from "../types";
import { appSecret, safeEqual } from "./crypto";
import { requestCookie } from "./request";

function sign(payload: string): string {
  return createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

export function serializeSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function adminSessionFor(request: Request): AdminSession | null {
  const parts = requestCookie(request, cookieName).split(".");
  let session: AdminSession | null = null;
  if (parts.length === 2 && parts[0] && parts[1] && safeEqual(parts[1], sign(parts[0]))) {
    try {
      const value: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      if (isAdminSession(value) && value.expiresAt > Date.now()) session = value;
    } catch {
      session = null;
    }
  }
  return session;
}

function isAdminSession(value: unknown): value is AdminSession {
  return typeof value === "object" && value !== null &&
    "csrfToken" in value && typeof value.csrfToken === "string" &&
    "expiresAt" in value && typeof value.expiresAt === "number";
}

export function sessionCookie(session: AdminSession): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName}=${serializeSession(session)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetime / 1000}${secure}`;
}

export function expiredSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
