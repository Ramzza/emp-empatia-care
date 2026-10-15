import { doctors } from "./config";
import { json } from "./http";
import { availableSlots, parseDate } from "./schedule";

export function getPublicConfig(): Response {
  return json(200, { turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "" });
}

export function getDoctors(): Response {
  return json(200, { doctors });
}

export function getAvailability(url: URL): Response {
  const doctorId = url.searchParams.get("doctorId") || "";
  const date = url.searchParams.get("date") || "";
  let response: Response;
  if (!doctors.some((doctor) => doctor.id === doctorId)) {
    response = json(400, { error: "Choose a valid clinician." });
  } else if (!parseDate(date)) {
    response = json(400, { error: "Choose a valid appointment date." });
  } else {
    response = json(200, { slots: availableSlots(doctorId, date) });
  }
  return response;
}
