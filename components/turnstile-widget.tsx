"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

interface TurnstileOptions {
  sitekey: string;
  theme: "light";
  callback(token: string): void;
  "expired-callback"(): void;
  "error-callback"(): void;
}

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: TurnstileOptions): string;
      remove(widgetId: string): void;
    };
  }
}

export function TurnstileWidget({ siteKey, onToken }: {
  siteKey: string;
  onToken: Dispatch<SetStateAction<string>>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;
    let script: HTMLScriptElement | null = null;
    const render = () => {
      if (active && container.current && window.turnstile) {
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey, theme: "light", callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      }
    };
    if (siteKey) {
      script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      const created = !script;
      script ??= document.createElement("script");
      script.addEventListener("load", render);
      script.addEventListener("error", () => setError("Verificarea de securitate nu este disponibilă."));
      if (created) {
        script.dataset.turnstile = "true";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.append(script);
      }
      if (window.turnstile) render();
    }
    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      script?.removeEventListener("load", render);
    };
  }, [siteKey, onToken]);

  return <><div ref={container} className="mt-4 min-h-2" />{error && <p className="mt-2 text-xs text-red-700">{error}</p>}</>;
}
