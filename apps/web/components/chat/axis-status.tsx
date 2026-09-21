"use client";

import { ThinkingOrb } from "thinking-orbs";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
   AxisStatus — indicador de estado del chat.

   Refleja el estado REAL de useChat, no simula nada:

     submitted              → connecting  (petición enviada, aún sin respuesta)
     streaming + reasoning  → working     (el modelo está razonando)
     streaming + texto      → composing   (la respuesta está llegando)
     error                  → estado de error (sin orb: un punto rojo + texto)
     ready                  → no se muestra nada

   El orb es un <canvas> 2D de 20px (preset "inline"): sin WebGL ni filtros,
   se pausa solo fuera de pantalla y respeta prefers-reduced-motion.
   ───────────────────────────────────────────────────────────────────────── */

export type ChatStatus = "submitted" | "streaming" | "ready" | "error";

interface AxisStatusProps {
  status: ChatStatus;
  isReasoning: boolean;
  className?: string;
}

type OrbState = "connecting" | "working" | "composing";

const LABELS: Record<OrbState, string> = {
  connecting: "Conectando",
  working: "Razonando",
  composing: "Escribiendo",
};

export function AxisStatus({ status, isReasoning, className }: AxisStatusProps) {
  if (status === "ready") return null;

  if (status === "error") {
    return (
      <div
        role="alert"
        className={cn(
          "flex animate-fade-in items-center gap-2.5 text-[12.5px] text-destructive/90",
          className
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center">
          <span className="h-1.5 w-1.5 rounded-full bg-destructive shadow-[0_0_10px_hsl(var(--destructive)/0.7)]" />
        </span>
        No se pudo completar la respuesta. Inténtalo de nuevo.
      </div>
    );
  }

  const orb: OrbState =
    status === "submitted" ? "connecting" : isReasoning ? "working" : "composing";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex animate-fade-in items-center gap-2.5 text-[12.5px] text-muted-foreground",
        className
      )}
    >
      {/* Sin key: cambiar la prop `state` transiciona la animación sin remontar el
          <canvas> (un remonte reiniciaría el lienzo y parpadearía entre fases). */}
      <ThinkingOrb state={orb} size={20} theme="dark" aria-label={LABELS[orb]} />
      <span>{LABELS[orb]}</span>
    </div>
  );
}
