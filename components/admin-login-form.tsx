"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/client/api";

interface SessionResponse {
  admin: boolean;
  csrfToken?: string;
}

export function AdminLoginForm({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      await api("/api/admin/login", {
        method: "POST", body: JSON.stringify({ username, password }),
      });
      const session = await api<SessionResponse>("/api/admin/session");
      if (session.admin && session.csrfToken) onAuthenticated(session.csrfToken);
      else throw new Error("Administrator access could not be verified.");
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A apărut o eroare. Încearcă din nou.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-8 max-w-lg rounded border border-ink/10 bg-white p-6" onSubmit={submit}>
      <h2 className="text-lg font-semibold">Accesul clinicii</h2>
      <label className="mt-5 block text-xs font-semibold">Utilizator
        <input className="mt-2 min-h-11 w-full rounded border border-ink/15 px-3 font-normal" autoComplete="username" maxLength={120} value={username} onChange={(event) => setUsername(event.target.value)} required />
      </label>
      <label className="mt-4 block text-xs font-semibold">Parolă
        <input className="mt-2 min-h-11 w-full rounded border border-ink/15 px-3 font-normal" type="password" autoComplete="current-password" maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
      <p className="min-h-6 py-2 text-xs text-red-700" aria-live="polite">{message}</p>
      <button className="w-full rounded bg-clinic px-5 py-4 text-xs font-semibold text-white disabled:opacity-50" type="submit" disabled={submitting}>{submitting ? "Se autentifică…" : "Autentificare ↗"}</button>
      <p className="mt-4 text-[10px] text-muted">Accesul este rezervat personalului clinicii.</p>
    </form>
  );
}
