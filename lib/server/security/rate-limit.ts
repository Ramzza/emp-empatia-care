import { hmac } from "./crypto";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const entries = new Map<string, RateLimitEntry>();

export function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return request.headers.get("x-real-ip") || forwarded || "unknown";
}

export function rateLimit(request: Request, key: string, max: number, windowMs: number): boolean {
  const bucketKey = `${key}:${hmac(requestIp(request))}`;
  const now = Date.now();
  if (entries.size > 5000) {
    for (const [candidate, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(candidate);
    }
    while (entries.size > 5000) entries.delete(entries.keys().next().value || "");
  }
  const previous = entries.get(bucketKey);
  let allowed = true;
  if (!previous || previous.resetAt <= now) {
    entries.set(bucketKey, { count: 1, resetAt: now + windowMs });
  } else {
    previous.count += 1;
    allowed = previous.count <= max;
  }
  return allowed;
}
