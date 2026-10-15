export function clinicDate(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest", day: "numeric", month: "long", weekday: "long", ...options,
  }).format(new Date(value));
}

export function clinicTime(value: string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
