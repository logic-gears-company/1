"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Liquid } from "liquid-gooey";
import {
  Plus,
  Bot,
  Image as ImageIcon,
  Paperclip,
  Globe,
  Code2,
  Calculator,
  ChevronLeft,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
   PlusMenu — el "+" del composer, como extensión líquida del propio composer.

   Cerrado:  "+"
   Abierto:  "+" rota a "×" y, de la misma gota, se separan tres gotas hacia
             arriba (Archivo · Foto · Agent) que se estiran y se sueltan como
             liquid-gooey (efecto "morph").

   - Las GOTAS (círculos con icono) viven dentro de <Liquid>: es el filtro goo
     el que las funde con el "+". Las ETIQUETAS van fuera del filtro para
     que el texto se vea nítido.
   - Agent abre un panel de cristal (submenú) con Web Search / Code Executor /
     Calculator y el interruptor del modo Agent. Es texto denso: no encaja
     como gotas, así que emerge del "+" como panel.
   - Se cierra al elegir una acción, al tocar fuera y con Escape.
   - prefers-reduced-motion: sin gooey ni animaciones, aparece/desaparece.
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

/** Separación vertical (px) entre gotas cuando el menú está abierto. */
const STEP = 50;

/** Color de la masa líquida (≈ --card). Literal a propósito: la librería lo usa
 *  como relleno del filtro y no está garantizado que resuelva una var() de CSS. */
const LIQUID_FILL = "#1b1b1f";

// useLayoutEffect en cliente; useEffect en servidor (evita el aviso de SSR)
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface RootAction {
  id: string;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  active?: boolean;
  onClick: () => void;
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
  const [reduceMotion, setReduceMotion] = useState(false);
  // El grupo líquido sigue visible mientras dura la animación de cierre
  const [lingering, setLingering] = useState(false);
  // Posición "natural" (sin transformar) de cada gota respecto al "+", en px.
  const [rel, setRel] = useState<Record<string, number> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const calibrated = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // prefers-reduced-motion (escucha en vivo)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Limpia el temporizador de cierre al desmontar
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    // Vuelve a la raíz después de la animación de salida
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setView("root"), 220);
  }

  function toggle() {
    if (open) close();
    else setOpen(true);
  }

  const activeToolCount = agentMode ? selectedTools.size : 0;

  // Acciones de la raíz, de abajo (más cerca del "+") hacia arriba.
  const actions: RootAction[] = [
    {
      id: "file",
      label: "Archivo",
      hint: "Adjuntar un documento",
      icon: Paperclip,
      onClick: () => {
        close();
        onPickFile();
      },
    },
    {
      id: "photo",
      label: "Foto",
      hint: "Adjuntar una imagen",
      icon: ImageIcon,
      onClick: () => {
        close();
        onPickPhoto();
      },
    },
    {
      id: "agent",
      label: "Agent",
      hint: agentMode
        ? `${activeToolCount} herramienta${activeToolCount !== 1 ? "s" : ""} activa${activeToolCount !== 1 ? "s" : ""}`
        : "Herramientas autónomas",
      icon: Bot,
      active: agentMode,
      // No cierra: abre el submenú de Agent
      onClick: () => setView("agent"),
    },
  ];

  const showRoot = open && view === "root";
  const showAgent = open && view === "agent";

  // Mantiene visible el grupo líquido mientras se ve la animación de cierre y
  // lo oculta del todo después: cerrado = solo se ve el "+", nada más.
  useEffect(() => {
    if (showRoot) {
      setLingering(true);
      return;
    }
    const t = setTimeout(() => setLingering(false), 650);
    return () => clearTimeout(t);
  }, [showRoot]);
  const groupVisible = showRoot || lingering;

  /* ── Calibración ────────────────────────────────────────────────────────
     liquid-gooey coloca cada <Liquid.Item> en el FLUJO normal del documento
     (uno debajo de otro) y trata x/y como desplazamiento RELATIVO a esa
     posición. Por eso un `y` absoluto dejaba las gotas colgando bajo el "+"
     (cerrado) y amontonadas encima del "+" (abierto).
     No dependemos del layout interno de la librería: al montar (todas las
     transformaciones a 0) medimos dónde cae cada gota respecto al "+" y
     restamos esa diferencia. Así cerrado = todas sobre el "+" y abierto =
     gotas exactamente a STEP px una de otra, sea cual sea cómo las apile.
     Se mide UNA sola vez: la posición natural no cambia entre montajes, y un
     remonte posterior (p. ej. al alternar reduced-motion) mediría ya con la
     transformación aplicada y daría un desfase. */
  useIsoLayoutEffect(() => {
    if (reduceMotion || calibrated.current) return;
    const plus = rootRef.current?.querySelector<HTMLElement>("[data-plus]");
    const drops = groupRef.current?.querySelectorAll<HTMLElement>("[data-drop]");
    if (!plus || !drops || drops.length === 0) return;
    const plusTop = plus.getBoundingClientRect().top;
    const next: Record<string, number> = {};
    drops.forEach((el) => {
      const id = el.dataset.drop;
      if (id) next[id] = el.getBoundingClientRect().top - plusTop;
    });
    calibrated.current = true;
    setRel(next);
  }, [reduceMotion]);

  /** `y` para <Liquid.Item>: destino deseado (respecto al "+") menos su posición natural. */
  function yOf(id: string, k?: number) {
    const target = showRoot && k !== undefined ? -(k + 1) * STEP : 0;
    return target - (rel?.[id] ?? 0);
  }

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      {/* ── Botón + / × (el "tronco" del que salen las gotas) ─────────────── */}
      <button
        type="button"
        data-plus
        onClick={toggle}
        disabled={disabled}
        aria-label={open ? "Cerrar menú" : "Abrir menú de acciones"}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "relative z-10 flex h-9 w-9 items-center justify-center rounded-full border transition-[color,background-color,border-color,transform] duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          "active:scale-90 disabled:pointer-events-none disabled:opacity-40",
          open
            ? "border-white/20 bg-white/[0.09] text-foreground"
            : "border-white/[0.09] bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground"
        )}
      >
        <Plus
          className={cn(
            "h-[18px] w-[18px] transition-transform duration-300 ease-[cubic-bezier(.34,1.4,.64,1)]",
            "motion-reduce:transition-none",
            open ? "rotate-45" : "rotate-0"
          )}
          strokeWidth={1.75}
        />
        {/* Punto indicador cuando el modo Agent está activo y el menú cerrado */}
        {agentMode && !open && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-foreground ring-2 ring-card" />
        )}
      </button>

      {/* ── Gotas de la raíz ─────────────────────────────────────────────── */}
      {reduceMotion ? (
        /* prefers-reduced-motion: sin gooey ni animación; aparecen/desaparecen */
        <div
          role={showRoot ? "menu" : undefined}
          aria-label={showRoot ? "Acciones" : undefined}
          className="pointer-events-none absolute bottom-0 left-0 h-9 w-9"
        >
          {actions.map((a, k) => (
            <div
              key={a.id}
              className={cn(
                "absolute left-0 top-0 h-9 w-9 rounded-full border border-white/[0.07] bg-[#1b1b1f]",
                "shadow-[0_6px_18px_rgba(0,0,0,.45)]",
                !showRoot && "hidden"
              )}
              style={{ transform: `translateY(${-(k + 1) * STEP}px)` }}
            >
              <DropButton action={a} enabled={showRoot} />
            </div>
          ))}
        </div>
      ) : (
        /* Contenedor anclado al "+" y con la base alineada con él: el flujo
           natural de las gotas crece HACIA ARRIBA (nunca por debajo del composer,
           donde ampliaría el área desplazable). Oculto por completo si no hace
           falta: el estado "cerrado" no dibuja nada salvo el propio "+". */
        <div
          ref={groupRef}
          role={showRoot ? "menu" : undefined}
          aria-label={showRoot ? "Acciones" : undefined}
          className="pointer-events-none absolute bottom-0 left-0 flex w-9 flex-col justify-end"
          style={{ visibility: groupVisible ? "visible" : "hidden" }}
        >
          <Liquid blur={6} contrast={18} fill={LIQUID_FILL} shadow="0 6px 18px rgba(0,0,0,.45)">
            {/* Orden del DOM = orden visual de arriba abajo (Agent, Foto, Archivo);
                así el tabulador recorre el menú en el orden en que se ve. `k` es la
                posición contando desde el "+" (0 = la más cercana). */}
            {[...actions].reverse().map((a, idx) => {
              const k = actions.length - 1 - idx;
              return (
                <Liquid.Item
                  key={a.id}
                  x={0}
                  y={yOf(a.id, k)}
                  transition="bouncy"
                  delay={k * 40}
                >
                  <div data-drop={a.id} className="h-9 w-9 rounded-full">
                    <DropButton action={a} enabled={showRoot} />
                  </div>
                </Liquid.Item>
              );
            })}

            {/* Gota ancla: la masa líquida bajo el "+", de la que se separan las demás */}
            <Liquid.Item x={0} y={yOf("anchor")} transition="bouncy">
              <div data-drop="anchor" className="h-9 w-9 rounded-full" />
            </Liquid.Item>
          </Liquid>
        </div>
      )}

      {/* Etiquetas (fuera del filtro goo → texto nítido). Misma posición que su
          gota; solo aparecen con el menú abierto. Tocar la etiqueta activa la
          misma acción (área táctil más amplia). Son decorativas para lectores de
          pantalla: el botón de la gota ya lleva el mismo aria-label. */}
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-9 w-9">
        {actions.map((a, k) => (
          <span
            key={a.id}
            onClick={showRoot ? a.onClick : undefined}
            className={cn(
              "absolute left-[2.75rem] top-0 flex h-9 max-w-[min(11.5rem,calc(100vw-6.5rem))] flex-col justify-center",
              "rounded-full border border-white/[0.07] bg-popover/90 px-3 backdrop-blur-md",
              "shadow-[0_6px_20px_rgba(0,0,0,.4)]",
              !reduceMotion && "transition-[transform,opacity] duration-200 ease-out",
              showRoot ? "pointer-events-auto cursor-pointer active:scale-95" : "pointer-events-none"
            )}
            style={{
              transform: `translateY(${showRoot ? -(k + 1) * STEP : 0}px)`,
              opacity: showRoot ? 1 : 0,
              transitionDelay: showRoot && !reduceMotion ? `${120 + k * 40}ms` : "0ms",
            }}
          >
            <span className="truncate text-[12.5px] font-medium leading-tight text-foreground">
              {a.label}
            </span>
            <span className="truncate text-[10.5px] leading-tight text-muted-foreground">
              {a.hint}
            </span>
          </span>
        ))}
      </div>

      {/* ── Submenú de Agent (panel de cristal que emerge del "+") ───────── */}
      {showAgent && (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full left-0 z-50 mb-2.5 w-[min(15.5rem,calc(100vw-2rem))] overflow-hidden rounded-[1.4rem]",
            "border border-white/[0.08] bg-popover/95 p-1.5 backdrop-blur-xl",
            "shadow-[0_18px_60px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.05)]",
            !reduceMotion &&
              "animate-in fade-in-0 zoom-in-90 slide-in-from-bottom-2 duration-200 origin-bottom-left"
          )}
        >
          {/* Cabecera: volver + interruptor del modo Agent */}
          <div className="flex items-center justify-between px-1 pb-1.5">
            <button
              type="button"
              onClick={() => setView("root")}
              className="flex min-h-[32px] items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Agent
            </button>
            <Switch checked={agentMode} onChange={onToggleAgent} label="Activar modo Agent" />
          </div>

          <div className="mx-1 mb-1 h-px bg-white/[0.07]" />

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
        </div>
      )}
    </div>
  );
}

/* ─── Piezas internas ──────────────────────────────────────────────────────── */

/** Botón circular de una gota (icono + punto si el modo Agent está activo). */
function DropButton({ action, enabled }: { action: RootAction; enabled: boolean }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={enabled ? 0 : -1}
      onClick={action.onClick}
      aria-label={action.label}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-full",
        "text-foreground/90 transition-transform active:scale-90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        enabled ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      <Icon className="h-[17px] w-[17px]" strokeWidth={1.75} />
      {action.id === "agent" && action.active && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-foreground" />
      )}
    </button>
  );
}

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
        "group flex min-h-[44px] w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
        "hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none active:bg-white/[0.08]",
        dimmed && "opacity-60"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-colors",
          active
            ? "border-foreground/30 bg-foreground/10 text-foreground"
            : "border-white/[0.08] text-muted-foreground group-hover:text-foreground"
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
        "relative h-6 w-10 rounded-full border transition-colors",
        checked ? "border-foreground bg-foreground" : "border-border bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-4 w-4 rounded-full transition-all duration-200",
          checked ? "left-[1.3rem] bg-background" : "left-[3px] bg-muted-foreground"
        )}
      />
    </button>
  );
}
