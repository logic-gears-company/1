"use client";

import Link from "next/link";
import Silk from "@/components/ui/silk";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      {/* Fondo Silk (React Bits, WebGL vía three.js) — plano, sin
          divisiones ni grid, movimiento continuo de tela en escala de
          grises. Coincide con --primary ahora que la app es monocromática. */}
      <div className="absolute inset-0">
        <Silk speed={8.2} scale={1} color="#7B7481" noiseIntensity={1.5} rotation={6.28} />
      </div>

      <div className="relative z-10 flex w-full flex-col items-center">
        <Link href="/login" className="mb-10 flex flex-col items-center gap-1.5">
          <span className="text-xl font-semibold tracking-[0.2em]">
            {(process.env.NEXT_PUBLIC_APP_NAME ?? "AXIS").toUpperCase()}
          </span>
          <span className="text-xs text-muted-foreground/70 tracking-wide">
            Be human.
          </span>
        </Link>

        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
