import type { Metadata } from "next";
import { BookingForm } from "../../components/booking-form";
import { PortalHeader } from "../../components/portal-header";

export const metadata: Metadata = { title: "Programare online — Empatia" };

export default function BookingPage() {
  return (
    <>
      <PortalHeader />
      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <p className="text-[10px] font-bold tracking-[.17em] text-muted">PROGRAMARE ONLINE</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Alege programarea.</h1>
        <p className="mt-2 text-sm text-muted">Introdu datele și intervalul preferat. Fără cont și fără informații medicale.</p>
        <BookingForm />
      </main>
    </>
  );
}
