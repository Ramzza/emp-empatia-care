"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import { hashCnp } from "../cnp";
import type { Doctor } from "../shared";

export function useBooking() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [siteKey, setSiteKey] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [resetWidget, setResetWidget] = useState(0);
  const [cnp, setCnp] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api<{ doctors: Doctor[] }>("/api/doctors"),
      api<{ turnstileSiteKey: string }>("/api/config"),
    ]).then(([doctorResult, config]) => {
      if (active) {
        setDoctors(doctorResult.doctors);
        setDoctorId(doctorResult.doctors[0]?.id || "");
        setSiteKey(config.turnstileSiteKey);
      }
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "A apărut o eroare.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSelectedSlot("");
    if (date && doctorId) {
      setSlotsLoading(true);
      const query = new URLSearchParams({ doctorId, date });
      void api<{ slots: string[] }>(`/api/availability?${query}`).then((result) => {
        if (active) setSlots(result.slots);
      }).catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "A apărut o eroare.");
      }).finally(() => { if (active) setSlotsLoading(false); });
    } else {
      setSlots([]);
      setSlotsLoading(false);
    }
    return () => { active = false; };
  }, [date, doctorId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    if (!selectedSlot) setMessage("Alege mai întâi un interval disponibil.");
    else {
      setSubmitting(true);
      try {
        const cnpHash = await hashCnp(cnp);
        const website = String(new FormData(form).get("website") || "");
        await api("/api/appointments", {
          method: "POST",
          body: JSON.stringify({ cnpHash, email, doctorId, startsAt: selectedSlot, turnstileToken, website }),
        });
        setMessage("Programarea este confirmată. Verifică e-mailul pentru detalii și anulare.");
        setCnp("");
        setEmail("");
        setSelectedSlot("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "A apărut o eroare. Încearcă din nou.");
      } finally {
        setTurnstileToken("");
        setResetWidget((value) => value + 1);
        setSubmitting(false);
      }
    }
  }

  return {
    doctors, doctorId, setDoctorId, date, setDate, slots, selectedSlot, setSelectedSlot,
    siteKey, turnstileToken, setTurnstileToken, resetWidget, cnp, setCnp,
    email, setEmail, message, loading, slotsLoading, submitting, submit,
  };
}
