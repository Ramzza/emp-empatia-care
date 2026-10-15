import { requestIp } from "./rate-limit";

export async function verifyTurnstile(token: unknown, request: Request): Promise<boolean> {
  let valid = process.env.NODE_ENV !== "production";
  if (process.env.NODE_ENV === "production" && typeof token === "string" &&
      token.length > 0 && token.length <= 2048) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const body = new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY || "",
        response: token,
        remoteip: requestIp(request),
      });
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
      if (response.ok) {
        const result: unknown = await response.json();
        valid = typeof result === "object" && result !== null &&
          "success" in result && result.success === true &&
          "hostname" in result && result.hostname === process.env.TURNSTILE_EXPECTED_HOSTNAME;
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) throw error;
      valid = false;
    } finally {
      clearTimeout(timeout);
    }
  }
  return valid;
}
