import { appOrigin } from "../config";
import { safeEqual } from "./crypto";

export function validateWrite(request: Request, csrfToken?: string): boolean {
  const sameOrigin = request.headers.get("origin") === appOrigin();
  const suppliedToken = request.headers.get("x-csrf-token") || "";
  const validCsrf = csrfToken === undefined || safeEqual(suppliedToken, csrfToken);
  return sameOrigin && validCsrf;
}

export function requestCookie(request: Request, name: string): string {
  let result = "";
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) result = value.join("=");
  }
  return result;
}
