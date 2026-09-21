"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

/**
 * Anima la transición entre /login y /register (y cualquier otra ruta
 * dentro de este grupo). App Router no expone "de dónde vengo" ni
 * soporta exit-transitions nativamente, así que:
 *  - guardamos la ruta anterior en un ref (persiste entre renders,
 *    no dispara re-render por sí solo) para saber la dirección
 *  - /register entra desde la derecha; volver a /login entra desde
 *    la izquierda — el mismo eje que "avanzar" / "retroceder"
 *  - la key en pathname es lo que le dice a AnimatePresence que esto
 *    es una página distinta y debe correr exit + enter, no solo un
 *    re-render normal
 */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const direction = pathname === "/register" ? 1 : -1;
  prevPathRef.current = pathname;

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={pathname}
        custom={direction}
        initial={{ opacity: 0, x: direction * 24, scale: 0.92 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: direction * -24, scale: 0.92 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
