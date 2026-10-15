import { randomBytes } from "node:crypto";
import { getDatabase } from "./database";
import type { BookingInput } from "./types";

export function patientIsAuthorized(cnpHash: string): boolean {
  return Boolean(getDatabase().prepare("SELECT 1 FROM authorized_patients WHERE cnp_hash = ?").get(cnpHash));
}

export function patientHasActiveAppointment(cnpHash: string): boolean {
  return Boolean(getDatabase().prepare(`
    SELECT 1 FROM appointments WHERE cnp_hash = ? AND status IN ('pending', 'active')
  `).get(cnpHash));
}

export function reserveAppointment(input: BookingInput): string | null {
  const id = randomBytes(32).toString("hex");
  let reserved = false;
  try {
    getDatabase().prepare(`
      INSERT INTO appointments (id, cnp_hash, doctor_id, starts_at, ends_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      id, input.cnpHash, input.doctorId, input.startsAt,
      new Date(new Date(input.startsAt).getTime() + 30 * 60 * 1000).toISOString(),
      new Date().toISOString(),
    );
    reserved = true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
    const conflict = code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY";
    if (!conflict) throw error;
  }
  return reserved ? id : null;
}

export function removePendingAppointment(id: string): void {
  getDatabase().prepare("DELETE FROM appointments WHERE id = ? AND status = 'pending'").run(id);
}

export function activateAppointment(id: string): void {
  getDatabase().prepare("UPDATE appointments SET status = 'active' WHERE id = ? AND status = 'pending'").run(id);
}
