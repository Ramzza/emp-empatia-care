"use client";

import type { ReactNode } from "react";
import { clinicTime } from "../lib/format";

interface SlotPickerProps {
  slots: string[];
  selected: string;
  loading: boolean;
  onSelect: (value: string) => void;
}

export function SlotPicker({ slots, selected, loading, onSelect }: SlotPickerProps) {
  let content: ReactNode;
  if (loading) {
    content = <span className="text-xs text-muted">Se verifică orele disponibile…</span>;
  } else if (slots.length === 0) {
    content = <span className="text-xs text-muted">Nu sunt ore disponibile în această zi. Încearcă altă dată.</span>;
  } else {
    content = slots.map((slot) => (
      <button
        aria-pressed={slot === selected}
        className={`rounded border px-3 py-2 text-xs ${slot === selected ? "border-clinic bg-[#edf2e9]" : "border-ink/10 bg-white"}`}
        key={slot}
        onClick={() => onSelect(slot)}
        type="button"
      >{clinicTime(slot)}</button>
    ));
  }
  return <div className="flex min-h-9 flex-wrap gap-2">{content}</div>;
}
