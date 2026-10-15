import Link from "next/link";

export function Brand() {
  return (
    <Link className="inline-flex items-center gap-2.5" href="/" aria-label="Empatia, pagina principală">
      <span className="grid size-8 place-items-center rounded-full border border-clinic text-clinic" aria-hidden="true">✳</span>
      <span className="text-[26px] font-extrabold tracking-[-1.6px]">empatia<span className="text-leaf">.</span></span>
    </Link>
  );
}
