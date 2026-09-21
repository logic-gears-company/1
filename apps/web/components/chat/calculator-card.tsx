"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { safeEval, formatResult } from "@/lib/safe-math";

/* ─────────────────────────────────────────────────────────────────────────────
   CalculatorCard — calculadora inline dentro del chat (estilo ChatGPT).
   - Si recibe `expression`, la muestra ya cargada y con el resultado calculado.
   - Es totalmente usable: teclado táctil + teclado físico (cuando tiene foco).
   ───────────────────────────────────────────────────────────────────────── */

type Key = { label: string; value?: string; kind: "num" | "op" | "fn" | "eq"; span?: number };

const KEYS: Key[] = [
  { label: "C", kind: "fn" },
  { label: "( )", kind: "fn" },
  { label: "%", value: "%", kind: "fn" },
  { label: "÷", value: "/", kind: "op" },

  { label: "7", value: "7", kind: "num" },
  { label: "8", value: "8", kind: "num" },
  { label: "9", value: "9", kind: "num" },
  { label: "×", value: "*", kind: "op" },

  { label: "4", value: "4", kind: "num" },
  { label: "5", value: "5", kind: "num" },
  { label: "6", value: "6", kind: "num" },
  { label: "−", value: "-", kind: "op" },

  { label: "1", value: "1", kind: "num" },
  { label: "2", value: "2", kind: "num" },
  { label: "3", value: "3", kind: "num" },
  { label: "+", value: "+", kind: "op" },

  { label: "0", value: "0", kind: "num" },
  { label: ".", value: ".", kind: "num" },
  { label: "⌫", kind: "fn" },
  { label: "=", kind: "eq" },
];

interface CalculatorCardProps {
  /** Expresión inicial (p. ej. la que pidió el agente). */
  expression?: string;
  className?: string;
}

/** Convierte lo que se muestra (× ÷ −) en lo que evalúa el motor. */
function display(expr: string) {
  return expr.replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");
}

export function CalculatorCard({ expression = "", className }: CalculatorCardProps) {
  const [expr, setExpr] = useState(expression);
  // Tras "=" mostramos la expresión anterior pequeña arriba y el resultado grande
  const [committed, setCommitted] = useState<{ expr: string; result: string } | null>(() => {
    if (!expression) return null;
    const v = safeEval(expression);
    return v === null ? null : { expr: expression, result: formatResult(v) };
  });
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Vista previa en vivo del resultado mientras se escribe
  const live = expr ? safeEval(expr) : null;
  const preview = !committed && live !== null && /[+\-*/%^]/.test(expr.slice(1)) ? formatResult(live) : "";

  const press = useCallback(
    (key: Key) => {
      setError(false);

      if (key.label === "C") {
        setExpr("");
        setCommitted(null);
        return;
      }

      if (key.label === "⌫") {
        if (committed) {
          setCommitted(null);
          return;
        }
        setExpr((e) => e.slice(0, -1));
        return;
      }

      if (key.kind === "eq") {
        if (!expr) return;
        const v = safeEval(expr);
        if (v === null) {
          setError(true);
          return;
        }
        setCommitted({ expr, result: formatResult(v) });
        return;
      }

      // Paréntesis inteligente: abre o cierra según el contexto
      let token = key.value ?? "";
      if (key.label === "( )") {
        const open = (expr.match(/\(/g) ?? []).length;
        const close = (expr.match(/\)/g) ?? []).length;
        const last = expr.slice(-1);
        token = open > close && /[0-9)]/.test(last) ? ")" : "(";
      }

      // Si ya hay resultado y se teclea un número, se empieza de nuevo;
      // si se teclea un operador, se continúa con el resultado.
      if (committed) {
        const raw = String(safeEval(committed.expr) ?? "");
        if (key.kind === "op" || token === "%") setExpr(raw + token);
        else setExpr(token);
        setCommitted(null);
        return;
      }

      setExpr((e) => {
        // Evita dos operadores seguidos: el último reemplaza al anterior
        if (key.kind === "op" && /[+\-*/]$/.test(e) && e.length > 0) return e.slice(0, -1) + token;
        return e + token;
      });
    },
    [expr, committed]
  );

  // Teclado físico (solo cuando la tarjeta tiene foco)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      let target: Key | undefined;
      if (/^[0-9]$/.test(k)) target = KEYS.find((x) => x.value === k);
      else if (k === ".") target = KEYS.find((x) => x.value === ".");
      else if (k === "+") target = KEYS.find((x) => x.value === "+");
      else if (k === "-") target = KEYS.find((x) => x.value === "-");
      else if (k === "*" || k === "x") target = KEYS.find((x) => x.value === "*");
      else if (k === "/") target = KEYS.find((x) => x.value === "/");
      else if (k === "%") target = KEYS.find((x) => x.value === "%");
      else if (k === "(" || k === ")") target = KEYS.find((x) => x.label === "( )");
      else if (k === "Enter" || k === "=") target = KEYS.find((x) => x.kind === "eq");
      else if (k === "Backspace") target = KEYS.find((x) => x.label === "⌫");
      else if (k === "Escape" || k === "c" || k === "C") target = KEYS.find((x) => x.label === "C");
      if (target) {
        e.preventDefault();
        press(target);
      }
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [press]);

  const shownExpr = committed ? committed.expr : expr;
  const bigText = error ? "Error" : committed ? committed.result : expr ? display(expr) : "0";

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      aria-label="Calculadora"
      className={cn(
        "w-full max-w-[19rem] select-none rounded-3xl border border-border/80 bg-card p-3",
        "shadow-[0_12px_40px_rgba(0,0,0,.35)] outline-none",
        "focus-visible:border-foreground/25 animate-fade-in",
        className
      )}
    >
      {/* Pantalla */}
      <div className="mb-3 flex min-h-[5.25rem] flex-col items-end justify-end rounded-2xl bg-background/70 px-4 py-3">
        <div className="h-4 max-w-full truncate text-xs tabular-nums text-muted-foreground">
          {committed ? `${display(shownExpr)} =` : preview ? `= ${preview}` : ""}
        </div>
        <div
          className={cn(
            "max-w-full truncate font-medium tabular-nums tracking-tight",
            error ? "text-destructive" : "text-foreground",
            bigText.length > 12 ? "text-2xl" : bigText.length > 8 ? "text-3xl" : "text-4xl"
          )}
        >
          {bigText}
        </div>
      </div>

      {/* Teclado */}
      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key.label}
            type="button"
            onClick={() => press(key)}
            aria-label={key.label === "⌫" ? "Borrar" : key.label}
            className={cn(
              "flex h-12 items-center justify-center rounded-2xl text-[17px] font-medium tabular-nums",
              "transition-[transform,background-color] duration-100 active:scale-95",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              key.kind === "num" && "bg-secondary text-foreground hover:bg-accent",
              key.kind === "fn" && "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              key.kind === "op" && "bg-accent text-foreground hover:bg-secondary",
              key.kind === "eq" && "bg-foreground text-background hover:bg-foreground/90"
            )}
          >
            {key.label === "⌫" ? <Delete className="h-[18px] w-[18px]" strokeWidth={1.75} /> : key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
