"use client";

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from "react";
import { Square, X, FileText, Bot } from "lucide-react";
import { SendIcon } from "@animateicons/react/lucide/send-icon";
import { cn } from "@/lib/utils";
import { PlusMenu } from "@/components/chat/plus-menu";

/** Handle imperativo de los iconos de AnimateIcons (startAnimation/stopAnimation). */
type IconHandle = { startAnimation: () => void; stopAnimation: () => void };

export interface Attachment {
  id: string;
  file: File;
  kind: "image" | "file";
  /** URL local (blob) solo para imágenes, para la miniatura */
  previewUrl?: string;
}

interface ChatInputProps {
  onSend: (message: string, attachments: Attachment[]) => void;
  isLoading?: boolean;
  onStop?: () => void;
  agentMode?: boolean;
  selectedTools: Set<string>;
  onToggleAgent: (on: boolean) => void;
  onToggleTool: (tool: string) => void;
}

const MAX_FILE_MB = 10;

export function ChatInput({
  onSend,
  isLoading,
  onStop,
  agentMode = false,
  selectedTools,
  onToggleAgent,
  onToggleTool,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendIconRef = useRef<IconHandle>(null);

  // Auto-altura del textarea
  useEffect(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  }, [value]);

  // Libera las URLs blob al desmontar
  useEffect(() => {
    return () => {
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(e: ChangeEvent<HTMLInputElement>, kind: "image" | "file") {
    const list = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (list.length === 0) return;

    const tooBig = list.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) {
      setFileError(`"${tooBig.name}" pesa más de ${MAX_FILE_MB} MB`);
      setTimeout(() => setFileError(null), 3500);
    }

    const ok = list
      .filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024)
      .map<Attachment>((file) => ({
        id: Math.random().toString(36).slice(2),
        file,
        kind,
        previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
      }));

    setAttachments((prev) => [...prev, ...ok]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const gone = prev.find((a) => a.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // En móvil Enter = salto de línea (se envía con el botón); en escritorio Enter envía
    const isTouch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !isTouch) {
      e.preventDefault();
      if (canSend) sendIconRef.current?.startAnimation();
      handleSend();
    }
  }

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isLoading;

  function handleSend() {
    if (!canSend) return;
    onSend(value.trim(), attachments);
    setValue("");
    setAttachments([]); // las URLs blob las conserva el mensaje enviado; no se revocan aquí
  }

  return (
    <div className="relative">
      {/* Error de archivo */}
      {fileError && (
        <div className="absolute -top-9 left-1 right-1 animate-fade-in rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {fileError}
        </div>
      )}

      <div
        className={cn(
          "group/composer relative isolate rounded-[1.75rem] p-2 transition-[border-color,box-shadow,background-color] duration-300",
          // Material: cristal oscuro translúcido + borde alpha casi invisible
          "border border-white/[0.08] bg-[hsl(240_6%_9%/0.72)] backdrop-blur-xl",
          // Highlight superior y sombra ambiental (capas, no un gradiente pesado)
          "shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_10px_40px_rgba(0,0,0,.45)]",
          // Focus: borde algo más claro + glow discreto
          "focus-within:border-white/[0.16] focus-within:bg-[hsl(240_6%_10%/0.8)]",
          "focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,.09),0_0_0_1px_rgba(255,255,255,.03),0_0_32px_-4px_rgba(255,255,255,.08),0_14px_50px_rgba(0,0,0,.55)]"
        )}
      >
        {/* Halo ambiental bajo el composer: solo se enciende con focus-within */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-x-3 -bottom-4 -top-2 -z-10 rounded-[2.4rem] opacity-0",
            "bg-[radial-gradient(60%_90%_at_50%_100%,hsl(0_0%_100%/0.07),transparent_70%)]",
            "transition-opacity duration-500 group-focus-within/composer:opacity-100"
          )}
        />

        {/* Adjuntos */}
        {attachments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-1.5 pb-2 pt-1">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group relative flex-shrink-0 animate-fade-in overflow-hidden rounded-xl border border-border/80 bg-background/60"
              >
                {a.kind === "image" && a.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.previewUrl} alt={a.file.name} className="h-14 w-14 object-cover" />
                ) : (
                  <div className="flex h-14 max-w-[9.5rem] items-center gap-2 px-3">
                    <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="truncate text-xs text-foreground/90">{a.file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={`Quitar ${a.file.name}`}
                  className="absolute right-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-background/90 text-foreground shadow ring-1 ring-border transition-transform active:scale-90"
                >
                  <X className="h-3 w-3" strokeWidth={2.25} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <div className="pb-[3px] pl-[3px]">
            <PlusMenu
              agentMode={agentMode}
              selectedTools={selectedTools}
              onToggleAgent={onToggleAgent}
              onToggleTool={onToggleTool}
              onPickPhoto={() => photoInputRef.current?.click()}
              onPickFile={() => fileInputRef.current?.click()}
              disabled={isLoading}
            />
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={agentMode ? "Describe qué debe resolver AXIS…" : "Escribe a AXIS…"}
            rows={1}
            enterKeyHint="send"
            className={cn(
              "max-h-[200px] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-[9px] text-[15px] leading-6 tracking-[-0.005em] outline-none",
              "text-foreground caret-foreground placeholder:text-muted-foreground/60"
            )}
          />

          {isLoading ? (
            /* sending: detener */
            <button
              type="button"
              onClick={onStop}
              title="Detener"
              aria-label="Detener generación"
              className={cn(
                "mb-[3px] mr-[3px] flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[1.05rem]",
                "border border-white/[0.14] bg-white/[0.08] text-foreground",
                "shadow-[inset_0_1px_0_rgba(255,255,255,.08)] transition-[transform,background-color] duration-150",
                "hover:bg-white/[0.12] active:scale-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              )}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            /* disabled ↔ ready */
            <button
              type="button"
              onClick={handleSend}
              onPointerDown={() => canSend && sendIconRef.current?.startAnimation()}
              disabled={!canSend}
              title="Enviar"
              aria-label="Enviar mensaje"
              className={cn(
                "mb-[3px] mr-[3px] flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[1.05rem]",
                "transition-[transform,background-color,box-shadow,color,opacity] duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                canSend
                  ? [
                      // ready: pieza clara con luz propia, no un círculo genérico
                      "bg-foreground text-background",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,.5),0_6px_18px_-4px_rgba(255,255,255,.28)]",
                      "hover:bg-foreground/90 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.55),0_8px_22px_-4px_rgba(255,255,255,.36)]",
                      "active:scale-90",
                    ]
                  : // disabled: hundido en el cristal
                    "cursor-not-allowed border border-white/[0.06] bg-white/[0.04] text-muted-foreground/50"
              )}
            >
              <SendIcon ref={sendIconRef} size={18} />
            </button>
          )}
        </div>

        {/* Chip del modo Agent (solo cuando está activo) */}
        {agentMode && (
          <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5">
            <button
              type="button"
              onClick={() => onToggleAgent(false)}
              className="group flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 py-1 pl-2 pr-1.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
              aria-label="Desactivar modo Agent"
            >
              <Bot className="h-3 w-3" strokeWidth={1.75} />
              Agent · {selectedTools.size} herramienta{selectedTools.size !== 1 ? "s" : ""}
              <X className="h-3 w-3 opacity-60 group-hover:opacity-100" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {/* Inputs ocultos: cámara/galería y archivos */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => addFiles(e, "image")}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.xlsx,.pptx"
        multiple
        hidden
        onChange={(e) => addFiles(e, "file")}
      />
    </div>
  );
}
