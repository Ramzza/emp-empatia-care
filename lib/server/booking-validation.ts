import { json } from "./http";
import type { BookingInput, JsonObject } from "./types";

const bookingFields = new Set(["cnpHash", "email", "doctorId", "startsAt", "turnstileToken", "website"]);

export type BookingValidation = { input: BookingInput } | { response: Response };

export function validateBookingBody(body: JsonObject): BookingValidation {
  let result: BookingValidation;
  if ("cnp" in body) {
    result = { response: json(400, { error: "Send only the hashed CNP." }) };
  } else if (Object.keys(body).some((key) => !bookingFields.has(key))) {
    result = { response: json(400, { error: "The booking contains unsupported fields." }) };
  } else if (typeof body.website === "string" && body.website.length > 0) {
    result = { response: json(403, { error: "Request could not be verified." }) };
  } else if (typeof body.cnpHash !== "string" || !/^[0-9a-f]{64}$/.test(body.cnpHash)) {
    result = { response: json(400, { error: "Enter a valid CNP." }) };
  } else if (typeof body.email !== "string" || body.email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    result = { response: json(400, { error: "Enter a valid email address." }) };
  } else if (typeof body.doctorId !== "string" || typeof body.startsAt !== "string") {
    result = { response: json(400, { error: "Choose a valid appointment time." }) };
  } else {
    result = { input: {
      cnpHash: body.cnpHash,
      email: body.email.trim(),
      doctorId: body.doctorId,
      startsAt: body.startsAt,
      turnstileToken: body.turnstileToken,
    } };
  }
  return result;
}
