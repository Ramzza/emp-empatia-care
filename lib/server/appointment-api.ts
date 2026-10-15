import { getDatabase } from "./database";
import { json } from "./http";
import { validateWrite } from "./security/request";

export function cancelAppointment(request: Request, appointmentId: string): Response {
  let response: Response;
  if (!validateWrite(request)) {
    response = json(403, { error: "Request origin is not allowed." });
  } else if (!/^[0-9a-f]{64}$/.test(appointmentId)) {
    response = json(404, { error: "Appointment not found or no longer cancellable." });
  } else {
    const result = getDatabase().prepare(`
      UPDATE appointments SET status = 'cancelled'
      WHERE id = ? AND status = 'active' AND starts_at > ?
    `).run(appointmentId, new Date().toISOString());
    response = result.changes === 1
      ? json(200, { ok: true })
      : json(404, { error: "Appointment not found or no longer cancellable." });
  }
  return response;
}
