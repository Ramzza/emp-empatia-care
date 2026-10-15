"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/client/api";
import { clinicDate, clinicTime } from "../lib/format";
import type { Appointment } from "../lib/shared";

export function AppointmentList() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [message, setMessage] = useState("Se încarcă programările…");

  useEffect(() => {
    let active = true;
    void api<{ appointments: Appointment[] }>("/api/appointments").then((result) => {
      if (active) {
        setAppointments(result.appointments);
        setMessage("");
      }
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "A apărut o eroare.");
    });
    return () => { active = false; };
  }, []);

  return (
    <section className="mt-8 rounded border border-ink/10 bg-white p-6">
      <div className="flex items-center justify-between"><div><p className="text-[9px] font-bold tracking-widest text-muted">AGENDA CABINETULUI</p><h2 className="mt-2 text-xl font-semibold">Programări active</h2></div><span className="grid size-9 place-items-center rounded-full bg-[#edf2e9] text-xs text-clinic">{appointments.length}</span></div>
      <p aria-live="polite" className="mt-5 text-xs text-muted">{message || (appointments.length ? "" : "Nu există programări active.")}</p>
      <div className="divide-y divide-ink/10">
        {appointments.map((appointment) => (
          <article className="flex items-center justify-between gap-4 py-4" key={appointment.id}>
            <div><p className="text-sm font-semibold">{appointment.doctorName}</p><p className="mt-1 text-xs text-muted">{clinicDate(appointment.startsAt, { weekday: "short" })}</p></div>
            <p className="text-sm font-semibold">{clinicTime(appointment.startsAt)} <span className="text-xs font-normal text-muted">30 min</span></p>
          </article>
        ))}
      </div>
    </section>
  );
}
