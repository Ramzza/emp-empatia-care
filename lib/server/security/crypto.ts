import { createHmac, timingSafeEqual } from "node:crypto";

export function appSecret(): string {
  return process.env.APP_SECRET || "local-development-key-not-for-production";
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hmac(value: string): string {
  return createHmac("sha256", appSecret()).update(value).digest("hex");
}
