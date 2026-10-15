"use client";

import { useBooking } from "../lib/client/use-booking";
import { SlotPicker } from "./slot-picker";
import { TurnstileWidget } from "./turnstile-widget";

export function BookingForm() {
  const booking = useBooking();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
  return (
    <form className="mt-8 grid gap-5 rounded border border-ink/10 bg-white p-5 sm:grid-cols-2 sm:p-8" onSubmit={booking.submit}>
      <div className="sm:col-span-2"><h2 className="text-xl font-semibold">Alege un moment.</h2><p className="mt-1 text-xs text-muted">Programările sunt disponibile pacienților înregistrați.</p></div>
      <label className="text-xs font-semibold">CNP
        <input className="mt-2 min-h-11 w-full rounded border border-ink/15 px-3 font-normal" value={booking.cnp} onChange={(event) => booking.setCnp(event.target.value)} inputMode="numeric" autoComplete="off" maxLength={13} pattern="[0-9]{13}" required />
        <span className="mt-2 block text-[10px] leading-5 text-muted">CNP-ul este hash-uit în browser și nu este trimis sau stocat în forma originală.</span>
      </label>
      <label className="text-xs font-semibold">Adresă de e-mail
        <input className="mt-2 min-h-11 w-full rounded border border-ink/15 px-3 font-normal" type="email" value={booking.email} onChange={(event) => booking.setEmail(event.target.value)} autoComplete="email" maxLength={254} required />
        <span className="mt-2 block text-[10px] leading-5 text-muted">Folosită pentru confirmare și anulare; nu este păstrată în baza de date.</span>
      </label>
      <label className="text-xs font-semibold">Medicul tău
        <select className="mt-2 min-h-11 w-full rounded border border-ink/15 bg-white px-3 font-normal" value={booking.doctorId} onChange={(event) => booking.setDoctorId(event.target.value)} disabled={booking.loading} required>
          {booking.doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">Ziua preferată
        <input className="mt-2 min-h-11 w-full rounded border border-ink/15 px-3 font-normal" type="date" min={today} value={booking.date} onChange={(event) => booking.setDate(event.target.value)} required />
      </label>
      <fieldset className="sm:col-span-2"><legend className="mb-3 text-xs font-semibold">Ore disponibile</legend><SlotPicker slots={booking.slots} selected={booking.selectedSlot} loading={booking.slotsLoading} onSelect={booking.setSelectedSlot} /></fieldset>
      <input className="absolute left-[-10000px] size-px" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="sm:col-span-2"><TurnstileWidget key={booking.resetWidget} siteKey={booking.siteKey} onToken={booking.setTurnstileToken} /><p aria-live="polite" className="min-h-6 py-2 text-xs text-red-700">{booking.message}</p></div>
      <button className="rounded bg-clinic px-5 py-4 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2" disabled={booking.loading || booking.submitting || booking.doctors.length === 0} type="submit">{booking.submitting ? "Se trimite…" : "Confirmă programarea ↗"}</button>
      <p className="text-[10px] leading-5 text-muted sm:col-span-2">Nu include informații medicale în această programare.</p>
    </form>
  );
}
