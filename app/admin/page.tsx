import type { Metadata } from "next";
import { AdminPortal } from "../../components/admin-portal";
import { PortalHeader } from "../../components/portal-header";

export const metadata: Metadata = { title: "Administrare — Empatia" };

export default function AdminPage() {
  return (
    <>
      <PortalHeader />
      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <p className="text-[10px] font-bold tracking-[.17em] text-muted">ADMINISTRARE</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Programări active</h1>
        <p className="mt-2 text-sm text-muted">Autentifică-te pentru a vedea agenda cabinetului.</p>
        <AdminPortal />
      </main>
    </>
  );
}
