import { json, readJson } from "./http";
import { rateLimit } from "./security/rate-limit";
import { validateWrite } from "./security/request";
import { createBooking } from "./booking-flow";
import { validateBookingBody } from "./booking-validation";

export async function postBooking(request: Request): Promise<Response> {
  let response: Response;
  if (!validateWrite(request)) {
    response = json(403, { error: "Request origin is not allowed." });
  } else if (!rateLimit(request, "booking", 12, 60 * 60 * 1000)) {
    response = json(429, { error: "Too many booking attempts. Please try again later." });
  } else {
    const validation = validateBookingBody(await readJson(request));
    response = "response" in validation
      ? validation.response
      : await createBooking(validation.input, request);
  }
  return response;
}
