import { pendingLifetime, timeZone } from "./config";
import { getDatabase } from "./database";

const formatter = new Intl.DateTimeFormat("ro-RO", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function parseDate(date: string): Date | null {
  let parsed: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const candidate = new Date(`${date}T12:00:00.000Z`);
    if (!Number.isNaN(candidate.getTime()) && candidate.toISOString().slice(0, 10) === date) parsed = candidate;
  }
  return parsed;
}

function localDateTimeToUtc(date: string, time: string): Date {
  const desired = Date.parse(`${date}T${time}:00.000Z`);
  let guess = desired;
  for (let count = 0; count < 3; count += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute),
    );
    guess = desired - (represented - guess);
  }
  return new Date(guess);
}

export function completeExpiredAppointments(now: string): void {
  const db = getDatabase();
  db.prepare("UPDATE appointments SET status = 'completed' WHERE status = 'active' AND ends_at <= ?").run(now);
  const pendingBefore = new Date(Date.now() - pendingLifetime).toISOString();
  db.prepare("DELETE FROM appointments WHERE status = 'pending' AND created_at <= ?").run(pendingBefore);
}

export function availableSlots(doctorId: string, date: string): string[] {
  const parsed = parseDate(date);
  const slots: string[] = [];
  if (parsed && parsed.getUTCDay() !== 0 && parsed.getUTCDay() !== 6) {
    completeExpiredAppointments(new Date().toISOString());
    for (let minute = 540; minute < 1020; minute += 30) {
      const hour = String(Math.floor(minute / 60)).padStart(2, "0");
      const mins = String(minute % 60).padStart(2, "0");
      const start = localDateTimeToUtc(date, `${hour}:${mins}`);
      const startIso = start.toISOString();
      const booked = getDatabase().prepare(`
        SELECT 1 FROM appointments
        WHERE doctor_id = ? AND starts_at = ? AND status IN ('pending', 'active')
      `).get(doctorId, startIso);
      if (start.getTime() > Date.now() && !booked) slots.push(startIso);
    }
  }
  return slots;
}
