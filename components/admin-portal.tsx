"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/client/api";
import { AdminLoginForm } from "./admin-login-form";
import { AppointmentList } from "./appointment-list";

interface SessionResponse {
  admin: boolean;
  csrfToken?: string;
}

export function AdminPortal() {
  const [csrfToken, setCsrfToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void api<SessionResponse>("/api/admin/session").then((session) => {
      if (active) setCsrfToken(session.admin ? session.csrfToken || "" : "");
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "A apărut o eroare.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function logout() {
    try {
      await api("/api/admin/logout", { method: "POST", body: "{}" }, csrfToken);
      setCsrfToken("");
      setMessage("Ai ieșit din cont.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A apărut o eroare.");
    }
  }

  let content: ReactNode;
  if (loading) content = <p className="mt-8 text-sm text-muted">Se verifică accesul administratorului…</p>;
  else if (csrfToken) {
    content = <><div className="mt-8 flex items-center justify-between"><span className="text-sm text-muted">Autentificat ca administrator</span><button className="rounded border border-ink/15 px-4 py-2 text-xs" onClick={() => void logout()}>Ieșire</button></div><AppointmentList /></>;
  } else {
    content = <><AdminLoginForm onAuthenticated={setCsrfToken} /><p aria-live="polite" className="mt-3 text-xs text-muted">{message}</p></>;
  }
  return content;
}
