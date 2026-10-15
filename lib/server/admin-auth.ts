import { randomBytes, scryptSync } from "node:crypto";
import { safeEqual } from "./security/crypto";

const username = process.env.ADMIN_USERNAME?.trim() || "";
const password = process.env.ADMIN_PASSWORD || "";
const salt = randomBytes(16).toString("hex");
const passwordHash = password
  ? scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex")
  : "";

export function verifyAdminCredentials(userInput: string, passwordInput: string): boolean {
  let validPassword = false;
  if (passwordHash && passwordInput.length >= 12 && passwordInput.length <= 1024) {
    const candidate = scryptSync(passwordInput, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
    validPassword = safeEqual(candidate, passwordHash);
  }
  const validUsername = username !== "" && safeEqual(userInput, username);
  return validUsername && validPassword;
}
