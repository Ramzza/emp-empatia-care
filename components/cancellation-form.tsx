"use client";

import { useState } from "react";
import { api } from "../lib/client/api";

export function CancellationForm({ appointmentId }: { appointmentId: string }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function cancel() {
    setMessage("");
    setSubmitting(true);
    try {
      await api(`/api/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
        method: "POST", body: "{}",
      });
      setMessage("Programarea a fost anulată.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A apărut o eroare. Încearcă din nou.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 rounded border border-ink/10 bg-white p-6">
      <p className="text-xs leading-6 text-muted">Confirmă anularea programării asociate acestui ID.</p>
      <p aria-live="polite" className="min-h-7 pt-3 text-xs text-muted">{message}</p>
      <button className="mt-2 rounded bg-clinic px-5 py-4 text-xs font-semibold text-white disabled:opacity-50" disabled={submitting} onClick={() => void cancel()} type="button">
        {submitting ? "Se anulează…" : "Anulează programarea"}
      </button>
    </div>
  );
}
