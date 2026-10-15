const doctors = [
  { initials: "DZ", name: "Dr. Darkó Zsuzsanna", role: "Medic de familie", tone: "bg-[#e9dfd1]" },
  { initials: "LA", name: "Dr. Lorenzovici Anna", role: "Medicină de familie și medicina muncii", tone: "bg-[#dce8de]" },
];

export function Team() {
  return (
    <section className="px-6 py-20 lg:px-[9vw] lg:py-28" id="echipa">
      <p className="text-[10px] font-bold tracking-[.17em] text-muted"><span className="text-leaf">02</span> &nbsp; OAMENII DIN SPATELE ÎNGRIJIRII</p>
      <div className="mt-9 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <h2 className="text-4xl leading-tight tracking-[-.04em] sm:text-5xl">Profesioniști care<br /><span className="text-leaf">pun omul pe primul loc.</span></h2>
        <p className="max-w-xs text-sm leading-6 text-muted">Experiență medicală și o abordare personală, într-un cabinet de familie.</p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {doctors.map((doctor) => (
          <article key={doctor.initials}>
            <div className={`relative grid aspect-[1.18] place-items-center overflow-hidden ${doctor.tone}`}>
              <span className="absolute right-[14%] top-[12%] size-44 rounded-full bg-white/50" />
              <span className="relative grid h-48 w-36 place-items-center rounded-t-[48%] bg-white/50 text-5xl tracking-tight text-clinic">{doctor.initials}</span>
              <span className="absolute bottom-4 left-5 text-4xl text-clinic/50">✳</span>
            </div>
            <div className="flex justify-between gap-4 pt-4"><div><h3 className="font-semibold">{doctor.name}</h3><p className="mt-1 text-xs text-muted">{doctor.role}</p></div><a className="grid size-9 shrink-0 place-items-center rounded-full border border-clinic/20 text-clinic" href="tel:+40265266049" aria-label="Sună la cabinet">↗</a></div>
          </article>
        ))}
      </div>
    </section>
  );
}
