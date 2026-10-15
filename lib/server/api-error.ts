import { HttpError, json } from "./http";

export function errorResponse(error: unknown): Response {
  let status = 500;
  let message = "Something went wrong. Please try again.";
  if (error instanceof HttpError) {
    status = error.status;
    message = error.message;
  } else {
    console.error("API request failed.");
  }
  return json(status, { error: message });
}
