import { doctors, newSession } from "./config";
import { getDatabase } from "./database";
import { verifyAdminCredentials } from "./admin-auth";
import { json, readJson } from "./http";
import { adminSessionFor, expiredSessionCookie, sessionCookie } from "./security/admin-session";
import { rateLimit } from "./security/rate-limit";
import { validateWrite } from "./security/request";
import type { AppointmentRow } from "./types";
import { completeExpiredAppointments } from "./schedule";

export function getAdminSession(request: Request): Response {
  const session = adminSessionFor(request);
  const data = session ? { admin: true, csrfToken: session.csrfToken } : { admin: false };
  return json(200, data);
}

export async function loginAdmin(request: Request): Promise<Response> {
  let response: Response;
  if (!validateWrite(request)) {
    response = json(403, { error: "Request origin is not allowed." });
  } else if (!rateLimit(request, "admin-login", 8, 15 * 60 * 1000)) {
    response = json(429, { error: "Too many attempts. Please try again later." });
  } else {
    const body = await readJson(request);
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!verifyAdminCredentials(username, password)) {
      response = json(401, { error: "Utilizator sau parolă incorectă." });
    } else {
      response = json(200, { admin: true }, { "Set-Cookie": sessionCookie(newSession()) });
    }
  }
  return response;
}

export function logoutAdmin(request: Request): Response {
  const session = adminSessionFor(request);
  let response: Response;
  if (!session) {
    response = json(401, { error: "Administrator access is required." });
  } else if (!validateWrite(request, session.csrfToken)) {
    response = json(403, { error: "Request could not be verified." });
  } else {
    response = json(200, { ok: true }, { "Set-Cookie": expiredSessionCookie() });
  }
  return response;
}

export function getAdminAppointments(request: Request): Response {
  const session = adminSessionFor(request);
  let response: Response;
  if (!session) {
    response = json(401, { error: "Administrator access is required." });
  } else {
    const now = new Date().toISOString();
    completeExpiredAppointments(now);
    const rows = getDatabase().prepare(`
      SELECT id, doctor_id, starts_at, ends_at, status
      FROM appointments
      WHERE status = 'active' AND starts_at >= ?
      ORDER BY starts_at
    `).all(now) as AppointmentRow[];
    const appointments = rows.map((row) => {
      const doctor = doctors.find((candidate) => candidate.id === row.doctor_id);
      if (!doctor) throw new Error("Appointment references an unknown clinician.");
      return {
        id: row.id, startsAt: row.starts_at, endsAt: row.ends_at,
        status: row.status, doctorName: doctor.name,
      };
    });
    response = json(200, { appointments });
  }
  return response;
}
