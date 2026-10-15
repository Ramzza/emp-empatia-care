import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Empatia — grijă care te ascultă",
  description: "Centrul Medical Empatia — medicină de familie și medicina muncii în Târgu Mureș.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers();
  return (
    <html lang="ro">
      <body className="bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
