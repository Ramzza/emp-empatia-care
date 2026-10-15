import Link from "next/link";

export function Hero() {
  return (
    <section className="grid gap-10 px-6 py-14 lg:grid-cols-2 lg:items-center lg:px-[9vw] lg:py-16" id="despre">
      <div>
        <p className="text-[10px] font-bold tracking-[.18em] text-muted">✳ &nbsp; MEDICINĂ CU GRIJĂ, ÎN RITMUL TĂU</p>
        <h1 className="mt-7 text-5xl leading-[1.08] tracking-[-.055em] sm:text-7xl">Grija începe<br />cu <span className="text-leaf">o conversație.</span></h1>
        <p className="mt-6 max-w-md text-sm leading-7 text-muted">Un loc în care ești ascultat, înțeles și îngrijit cu atenție. Medicină de familie și medicina muncii, aproape de tine.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className="rounded bg-clinic px-5 py-4 text-xs font-semibold text-white hover:bg-clinic-dark" href="/book">Fă o programare ↗</Link>
          <Link className="rounded border border-ink/10 bg-white px-5 py-4 text-xs font-semibold" href="#echipa">Descoperă echipa</Link>
        </div>
        <p className="mt-12 text-xs text-muted">✳ &nbsp; Un cabinet de familie, cu timp pentru tine.</p>
      </div>
      <div className="relative mx-auto grid aspect-[1.12] w-full max-w-lg place-items-center overflow-hidden rounded-t-[48%] bg-[#e9ede2]">
        <div className="absolute size-[72%] rounded-full border border-clinic/20" />
        <div className="absolute size-[55%] rounded-full border border-clinic/20" />
        <div className="relative grid size-48 place-items-center rounded-full bg-[#9db58a] text-8xl text-[#f2cf9b] shadow-[0_-35px_0_-18px_#759879,35px_0_0_-18px_#85a57e,0_35px_0_-18px_#709674,-35px_0_0_-18px_#a7ba8e]">✳</div>
        <span className="absolute bottom-[12%] right-[8%] bg-white/80 px-4 py-3 text-xs leading-5">Îngrijire<br />cu empatie</span>
        <span className="absolute left-[12%] top-[14%] text-[9px] leading-5 tracking-[.16em] text-muted">TÂRGU MUREȘ<br />DIN 2011</span>
      </div>
      <div className="col-span-full flex justify-between border-t border-ink/10 pt-5 text-[10px] tracking-widest text-muted">
        <span>01 — 03 &nbsp; ─── &nbsp; MEDICINĂ DE FAMILIE</span><Link href="#specialitati">Află mai multe ↓</Link>
      </div>
    </section>
  );
}
