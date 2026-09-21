"use client";

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from "react";
import { ArrowUp, Square, X, FileText, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlusMenu } from "@/components/chat/plus-menu";

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
          "rounded-[1.75rem] border border-border/80 bg-card/95 p-2 backdrop-blur-2xl transition-all",
          "shadow-[0_20px_65px_rgba(0,0,0,.35)]",
          "focus-within:border-foreground/25"
        )}
      >
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
              "max-h-[200px] min-w-0 flex-1 resize-none bg-transparent px-1.5 py-[9px] text-[15px] leading-6 outline-none",
              "placeholder:text-muted-foreground/70"
            )}
          />

          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              title="Detener"
              aria-label="Detener generación"
              className="mb-[3px] mr-[3px] flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition-transform active:scale-95"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              title="Enviar"
              aria-label="Enviar mensaje"
              className={cn(
                "mb-[3px] mr-[3px] flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-all active:scale-95",
                canSend
                  ? "bg-foreground text-background hover:bg-foreground/90"
                  : "bg-muted text-muted-foreground/60"
              )}
            >
              <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.25} />
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
