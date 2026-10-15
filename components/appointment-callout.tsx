import Link from "next/link";

export function AppointmentCallout() {
  return (
    <section className="relative flex flex-col justify-between gap-8 overflow-hidden bg-clinic px-8 py-16 text-white md:flex-row md:items-center lg:px-[13vw]">
      <span className="absolute -bottom-24 right-[30%] text-[260px] leading-none text-white/5" aria-hidden="true">✳</span>
      <div className="relative"><p className="text-[10px] tracking-[.17em] text-white/70">UȘOR, SIGUR, ÎN RITMUL TĂU</p><h2 className="mt-4 text-5xl leading-tight tracking-[-.04em]">Hai să avem grijă<br />de tine.</h2></div>
      <div className="relative max-w-xs"><p className="mb-5 text-sm leading-6 text-white/75">Programările online sunt disponibile pacienților înregistrați la clinică.</p><Link className="inline-flex rounded bg-white px-5 py-4 text-xs font-semibold text-ink" href="/book">Programează-te ↗</Link></div>
    </section>
  );
}
