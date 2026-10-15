import Link from "next/link";
import { Brand } from "./brand";

const links = [
  ["Despre noi", "#despre"],
  ["Specialități", "#specialitati"],
  ["Echipa", "#echipa"],
  ["Contact", "#contact"],
] as const;

export function SiteHeader() {
  return (
    <header className="flex min-h-[82px] items-center justify-between border-b border-ink/10 px-6 lg:px-[6vw]">
      <Brand />
      <nav className="hidden gap-8 text-xs text-muted lg:flex" aria-label="Navigare principală">
        {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      <div className="flex items-center gap-3 sm:gap-6">
        <a className="hidden text-xs text-muted md:inline" href="tel:+40265266049">0265 266 049</a>
        <Link className="rounded bg-clinic px-4 py-3 text-xs font-semibold text-white hover:bg-clinic-dark" href="/book">
          Programare <span aria-hidden="true">↗</span>
        </Link>
        <Link className="hidden text-xs text-muted sm:inline" href="/admin">Administrator</Link>
      </div>
    </header>
  );
}
