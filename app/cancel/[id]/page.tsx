import type { Metadata } from "next";
import { CancellationForm } from "../../../components/cancellation-form";
import { PortalHeader } from "../../../components/portal-header";

export const metadata: Metadata = { title: "Anulare programare — Empatia" };

export default async function CancelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PortalHeader />
      <main className="mx-auto max-w-xl px-5 py-16">
        <p className="text-[10px] font-bold tracking-[.17em] text-muted">GESTIONAREA PROGRAMĂRII</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Anulezi programarea?</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Confirmă anularea programării asociate acestui ID.</p>
        <CancellationForm appointmentId={id} />
      </main>
    </>
  );
}
