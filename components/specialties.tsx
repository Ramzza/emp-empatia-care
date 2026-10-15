export function Specialties() {
  return (
    <section className="bg-white px-6 py-20 lg:px-[9vw] lg:py-28" id="specialitati">
      <p className="text-[10px] font-bold tracking-[.17em] text-muted"><span className="text-leaf">01</span> &nbsp; CUM TE PUTEM AJUTA</p>
      <div className="mt-9 grid gap-8 lg:grid-cols-[1fr_.55fr] lg:items-end">
        <h2 className="text-4xl leading-tight tracking-[-.04em] sm:text-5xl">Medicină atentă.<br /><span className="text-leaf">Relații de durată.</span></h2>
        <div><p className="text-sm leading-7 text-muted">Credem că îngrijirea bună începe atunci când cineva te ascultă cu adevărat. Îți oferim sprijin medical apropiat, într-un cabinet în care ești mai mult decât o programare.</p><a className="mt-4 inline-block border-b border-leaf pb-1 text-xs font-semibold" href="#contact">Vizitează-ne la cabinet ↗</a></div>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <article className="border border-ink/10 bg-paper p-7"><p className="text-[9px] tracking-widest text-muted">01 / ÎNGRIJIRE CONTINUĂ</p><span className="mt-5 block text-2xl text-leaf">✳</span><h3 className="mt-3 text-xl font-semibold">Medicină de familie</h3><p className="mt-2 text-xs leading-6 text-muted">Îngrijire medicală personalizată pentru tine și familia ta, cu atenție la fiecare etapă a vieții.</p></article>
        <article className="border border-ink/10 bg-[#f1f4ec] p-7"><p className="text-[9px] tracking-widest text-muted">02 / SĂNĂTATE LA SERVICIU</p><span className="mt-5 block text-2xl text-[#c79b69]">✳</span><h3 className="mt-3 text-xl font-semibold">Medicina muncii</h3><p className="mt-2 text-xs leading-6 text-muted">Servicii de medicina muncii pentru angajați și organizații, într-un proces clar și eficient.</p></article>
      </div>
    </section>
  );
}
