import Link from "next/link";
import { Brand } from "./brand";

export function SiteFooter() {
  return (
    <footer className="flex flex-col gap-4 border-t border-ink/10 px-6 py-7 text-xs text-muted sm:flex-row sm:items-center sm:justify-between lg:px-[9vw]">
      <Brand />
      <p>Grijă cu empatie. Târgu Mureș.</p>
      <Link className="underline underline-offset-4" href="/admin">Acces administrator</Link>
      <span>© {new Date().getFullYear()} Centrul Medical Empatia</span>
    </footer>
  );
}
