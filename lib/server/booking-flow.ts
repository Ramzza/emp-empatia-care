import { randomBytes } from "node:crypto";
import { doctors } from "./config";
import { appointmentEmail, sendConfirmationEmail } from "./email";
import { json } from "./http";
import { availableSlots, completeExpiredAppointments } from "./schedule";
import { verifyTurnstile } from "./security/turnstile";
import type { BookingInput } from "./types";
import {
  activateAppointment, patientHasActiveAppointment, patientIsAuthorized,
  removePendingAppointment, reserveAppointment,
} from "./booking-store";

export async function createBooking(input: BookingInput, request: Request): Promise<Response> {
  let response: Response;
  const doctor = doctors.find((candidate) => candidate.id === input.doctorId);
  if (!doctor) {
    response = json(400, { error: "Choose a valid clinician." });
  } else {
    const now = new Date().toISOString();
    completeExpiredAppointments(now);
    if (!patientIsAuthorized(input.cnpHash)) {
      response = json(403, { error: "CNP-ul nu este înregistrat la clinică." });
    } else if (patientHasActiveAppointment(input.cnpHash)) {
      response = json(409, { error: "Există deja o programare activă pentru acest CNP." });
    } else if (!(await verifyTurnstile(input.turnstileToken, request))) {
      response = json(400, { error: "Completează verificarea de securitate și încearcă din nou." });
    } else if (!availableSlots(input.doctorId, input.startsAt.slice(0, 10)).includes(input.startsAt)) {
      response = json(409, { error: "Ora nu mai este disponibilă. Alege un alt interval." });
    } else {
      response = await reserveAndNotify(input, doctor.name);
    }
  }
  return response;
}

async function reserveAndNotify(input: BookingInput, doctorName: string): Promise<Response> {
  const id = reserveAppointment(input);
  let response: Response;
  if (!id) {
    response = json(409, { error: "Ora sau pacientul a fost programat între timp." });
  } else {
    let sent = false;
    try {
      await sendConfirmationEmail(appointmentEmail(input.email, id, doctorName, input.startsAt));
      sent = true;
    } catch {
      removePendingAppointment(id);
      console.error("Appointment confirmation delivery failed.");
    }
    if (sent) {
      activateAppointment(id);
      response = json(201, { ok: true, id });
    } else {
      response = json(503, { error: "Nu s-a putut trimite e-mailul de confirmare. Programarea nu a fost salvată." });
    }
  }
  return response;
}
