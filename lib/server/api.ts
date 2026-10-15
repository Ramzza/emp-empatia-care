import { assertProductionConfig } from "./config";
import { getAdminAppointments, getAdminSession, loginAdmin, logoutAdmin } from "./admin-api";
import { cancelAppointment } from "./appointment-api";
import { postBooking } from "./booking-api";
import { errorResponse } from "./api-error";
import { json } from "./http";
import { getAvailability, getDoctors, getPublicConfig } from "./public-api";

export async function handleApiRequest(request: Request): Promise<Response> {
  let response: Response;
  try {
    assertProductionConfig();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (method === "GET" && path === "/api/config") response = getPublicConfig();
    else if (method === "GET" && path === "/api/doctors") response = getDoctors();
    else if (method === "GET" && path === "/api/availability") response = getAvailability(url);
    else if (method === "GET" && path === "/api/admin/session") response = getAdminSession(request);
    else if (method === "GET" && path === "/api/appointments") response = getAdminAppointments(request);
    else if (method === "POST" && path === "/api/admin/login") response = await loginAdmin(request);
    else if (method === "POST" && path === "/api/admin/logout") response = logoutAdmin(request);
    else if (method === "POST" && path === "/api/appointments") response = await postBooking(request);
    else {
      const cancelMatch = path.match(/^\/api\/appointments\/([0-9a-f]{64})\/cancel$/);
      response = method === "POST" && cancelMatch
        ? cancelAppointment(request, cancelMatch[1] || "")
        : json(404, { error: "Not found." });
    }
  } catch (error) {
    response = errorResponse(error);
  }
  return response;
}
