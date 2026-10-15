import Link from "next/link";
import { Brand } from "./brand";

export function PortalHeader() {
  return (
    <header className="flex h-20 items-center justify-between border-b border-ink/10 bg-white px-6 lg:px-[7vw]">
      <Brand />
      <Link className="text-xs text-muted underline underline-offset-4" href="/">Înapoi la pagina clinicii</Link>
    </header>
  );
}
