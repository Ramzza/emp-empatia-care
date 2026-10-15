export interface Doctor {
  id: string;
  name: string;
}

export interface AppointmentRow {
  id: string;
  doctor_id: string;
  starts_at: string;
  ends_at: string;
  status: "active";
}

export interface BookingInput {
  cnpHash: string;
  email: string;
  doctorId: string;
  startsAt: string;
  turnstileToken: unknown;
}

export interface ConfirmationEmail {
  to: string;
  subject: string;
  text: string;
}

export type ConfirmationMailer = (message: ConfirmationEmail) => Promise<void>;
export type JsonObject = Record<string, unknown>;

export interface AdminSession {
  csrfToken: string;
  expiresAt: number;
}
