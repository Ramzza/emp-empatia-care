import { createTransport } from "nodemailer";
import { appOrigin, timeZone } from "./config";
import type { ConfirmationEmail, ConfirmationMailer } from "./types";

let testMailer: ConfirmationMailer | undefined;
let configuredMailer: ConfirmationMailer | undefined;

export function setMailerForTests(mailer: ConfirmationMailer | undefined): void {
  testMailer = mailer;
}

function createDefaultMailer(): ConfirmationMailer {
  const host = process.env.MAIL_HOST?.trim() || "";
  const port = Number(process.env.MAIL_PORT || "");
  const from = process.env.MAIL_FROM?.trim() || "";
  const username = process.env.MAIL_USERNAME || "";
  const password = process.env.MAIL_PASSWORD || "";
  if (Boolean(username) !== Boolean(password)) throw new Error("Configure both MAIL_USERNAME and MAIL_PASSWORD.");
  const configured = Boolean(host && Number.isInteger(port) && port > 0 && from);
  let send: ConfirmationMailer;
  if (!configured) {
    send = async () => { throw new Error("Appointment email delivery is not configured."); };
  } else {
    const transport = createTransport({
      host, port, secure: process.env.MAIL_SECURE === "true" || port === 465,
      ...(username ? { auth: { user: username, pass: password } } : {}),
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    });
    send = async (message) => {
      await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text });
    };
  }
  return send;
}

export async function sendConfirmationEmail(message: ConfirmationEmail): Promise<void> {
  let mailer = testMailer;
  if (!mailer) {
    configuredMailer ??= createDefaultMailer();
    mailer = configuredMailer;
  }
  await mailer(message);
}

export function appointmentEmail(email: string, id: string, doctorName: string, startsAt: string): ConfirmationEmail {
  const cancelUrl = new URL(`/cancel/${id}`, appOrigin());
  const localTime = new Intl.DateTimeFormat("ro-RO", {
    timeZone, dateStyle: "long", timeStyle: "short",
  }).format(new Date(startsAt));
  return {
    to: email,
    subject: "Confirmarea programării - Empatia",
    text: [
      "Programarea ta a fost confirmată.",
      `Medic: ${doctorName}`,
      `Data și ora: ${localTime}`,
      `ID programare: ${id}`,
      `Pentru anulare, accesează: ${cancelUrl}`,
    ].join("\n"),
  };
}
