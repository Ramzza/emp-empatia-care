import Link from "next/link";

export function Contact() {
  return (
    <section className="bg-white px-6 py-20 lg:px-[9vw] lg:py-28" id="contact">
      <p className="text-[10px] font-bold tracking-[.17em] text-muted"><span className="text-leaf">03</span> &nbsp; NE GĂSEȘTI AICI</p>
      <div className="mt-9 grid gap-10 md:grid-cols-2">
        <div><h2 className="text-4xl leading-tight tracking-[-.04em] sm:text-5xl">Un cabinet aproape<br /><span className="text-leaf">de tine.</span></h2><p className="mt-5 max-w-sm text-sm leading-7 text-muted">Te așteptăm în Târgu Mureș. Pentru informații sau programări telefonice, ne poți suna în timpul programului.</p></div>
        <div className="grid gap-7 sm:grid-cols-2">
          <div><p className="text-[9px] font-bold tracking-widest text-muted">ADRESĂ</p><p className="mt-3 text-xs leading-6 text-muted">Str. Tudor Vladimirescu nr. 61, ap. 1<br />Târgu Mureș, Mureș</p><a className="mt-2 inline-block text-xs underline underline-offset-4" href="https://maps.google.com/?q=Strada+Tudor+Vladimirescu+61,+T%C3%A2rgu+Mure%C8%99" target="_blank" rel="noreferrer">Deschide harta ↗</a></div>
          <div><p className="text-[9px] font-bold tracking-widest text-muted">TELEFON</p><p className="mt-3 text-xs text-muted"><a href="tel:+40265266049">0265 266 049</a><br /><a href="tel:+40760686671">0760 686 671</a></p></div>
          <div><p className="text-[9px] font-bold tracking-widest text-muted">PROGRAMĂRI ONLINE</p><p className="mt-3 text-xs text-muted">Disponibile pacienților înregistrați.</p><Link className="mt-2 inline-block text-xs underline underline-offset-4" href="/book">Fă o programare ↗</Link></div>
        </div>
      </div>
    </section>
  );
}
