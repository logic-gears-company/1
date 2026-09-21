"use client";

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Bot,
  Image as ImageIcon,
  Paperclip,
  Globe,
  Code2,
  Calculator,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
   PlusMenu — el "+" del composer.
   Cerrado: "+". Abierto: rota 45° y se vuelve "×" (misma geometría, sin
   intercambiar iconos → transición fluida). Despliega un menú con:
     Agent   → submenú con Web Search / Code Executor / Calculator
     Foto    → abre el selector de imágenes
     Archivo → abre el selector de archivos
   ───────────────────────────────────────────────────────────────────────── */

export const AGENT_TOOLS = [
  { id: "web_search", label: "Web Search", hint: "Buscar en internet", icon: Globe },
  { id: "code_executor", label: "Code Executor", hint: "Escribir y probar código", icon: Code2 },
  { id: "calculator", label: "Calculator", hint: "Cálculos y matemáticas", icon: Calculator },
] as const;

interface PlusMenuProps {
  agentMode: boolean;
  selectedTools: Set<string>;
  onToggleAgent: (on: boolean) => void;
  onToggleTool: (tool: string) => void;
  onPickPhoto: () => void;
  onPickFile: () => void;
  disabled?: boolean;
}

export function PlusMenu({
  agentMode,
  selectedTools,
  onToggleAgent,
  onToggleTool,
  onPickPhoto,
  onPickFile,
  disabled,
}: PlusMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"root" | "agent">("root");
  const rootRef = useRef<HTMLDivElement>(null);

  // Cerrar al tocar fuera o con Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    // Vuelve a la raíz después de la animación de salida
    setTimeout(() => setView("root"), 150);
  }

  function toggle() {
    if (open) close();
    else setOpen(true);
  }

  const activeToolCount = agentMode ? selectedTools.size : 0;

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      {/* Botón + / × */}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={open ? "Cerrar menú" : "Abrir menú de acciones"}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          "disabled:pointer-events-none disabled:opacity-40",
          open
            ? "border-foreground/25 bg-accent text-foreground"
            : "border-border/70 bg-transparent text-muted-foreground hover:border-foreground/25 hover:text-foreground"
        )}
      >
        <Plus
          className={cn(
            "h-[18px] w-[18px] transition-transform duration-200 ease-out",
            open ? "rotate-45" : "rotate-0"
          )}
          strokeWidth={1.75}
        />
        {/* Punto indicador cuando el modo Agent está activo y el menú cerrado */}
        {agentMode && !open && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-foreground ring-2 ring-card" />
        )}
      </button>

      {/* Menú */}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full left-0 z-50 mb-2 w-[15.5rem] overflow-hidden rounded-2xl",
            "border border-border/80 bg-popover/95 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,.55)] backdrop-blur-xl",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150 origin-bottom-left"
          )}
        >
          {view === "root" ? (
            <>
              <MenuItem
                icon={Bot}
                label="Agent"
                hint={
                  agentMode
                    ? `${activeToolCount} herramienta${activeToolCount !== 1 ? "s" : ""} activa${activeToolCount !== 1 ? "s" : ""}`
                    : "Herramientas autónomas"
                }
                active={agentMode}
                trailing={<ChevronRight className="h-4 w-4 text-muted-foreground/70" />}
                onClick={() => setView("agent")}
              />
              <MenuItem
                icon={ImageIcon}
                label="Foto"
                hint="Adjuntar una imagen"
                onClick={() => {
                  close();
                  onPickPhoto();
                }}
              />
              <MenuItem
                icon={Paperclip}
                label="Archivo"
                hint="Adjuntar un documento"
                onClick={() => {
                  close();
                  onPickFile();
                }}
              />
            </>
          ) : (
            <>
              {/* Cabecera del submenú: volver + interruptor del modo Agent */}
              <div className="flex items-center justify-between px-1 pb-1.5">
                <button
                  type="button"
                  onClick={() => setView("root")}
                  className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Agent
                </button>
                <Switch checked={agentMode} onChange={onToggleAgent} label="Activar modo Agent" />
              </div>

              <div className="mx-1 mb-1 h-px bg-border/70" />

              {AGENT_TOOLS.map((tool) => {
                const on = selectedTools.has(tool.id);
                return (
                  <MenuItem
                    key={tool.id}
                    icon={tool.icon}
                    label={tool.label}
                    hint={tool.hint}
                    active={agentMode && on}
                    dimmed={!agentMode}
                    trailing={
                      <span
                        className={cn(
                          "flex h-[18px] w-[18px] items-center justify-center rounded-md border transition-colors",
                          on
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-transparent"
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    }
                    onClick={() => {
                      // Tocar una herramienta enciende el modo Agent automáticamente
                      if (!agentMode) onToggleAgent(true);
                      onToggleTool(tool.id);
                    }}
                  />
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Piezas internas ──────────────────────────────────────────────────────── */

function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
  trailing,
  active,
  dimmed,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  hint?: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  active?: boolean;
  dimmed?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        dimmed && "opacity-60"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-colors",
          active
            ? "border-foreground/30 bg-foreground/10 text-foreground"
            : "border-border/70 text-muted-foreground group-hover:text-foreground"
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-tight text-foreground">{label}</span>
        {hint && (
          <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {trailing}
    </button>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 rounded-full border transition-colors",
        checked ? "border-foreground bg-foreground" : "border-border bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-200",
          checked ? "left-[1.1rem] bg-background" : "left-0.5 bg-muted-foreground"
        )}
      />
    </button>
  );
}
