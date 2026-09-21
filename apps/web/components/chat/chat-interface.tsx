"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useChat } from "@/hooks/use-chat";
import { ChatMessage } from "@/components/chat/message";
import { ChatInput } from "@/components/chat/chat-input";
import { AxisStatus } from "@/components/chat/axis-status";
import { AgentStepCard } from "@/components/chat/agent-mode-panel";
import type { AgentStep } from "@/components/chat/agent-mode-panel";
import { CalculatorCard } from "@/components/chat/calculator-card";
import type { Attachment } from "@/components/chat/chat-input";
import { Sparkles, Bot, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInterfaceProps {
  conversationId?: string;
  className?: string;
}

const DEFAULT_TOOLS = new Set(["web_search"]);

/** Saca la expresión matemática del contenido de un paso de calculadora. */
function extractExpression(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed?.expression === "string") return parsed.expression;
  } catch {
    /* no era JSON: seguimos con el texto plano */
  }
  const m = content.match(/[0-9(][0-9+\-*/%^().\s×÷−,]*[0-9)]/);
  return m ? m[0].trim() : "";
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function ChatInterface({ conversationId, className }: ChatInterfaceProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading, status, isReasoning, send, stop } = useChat(conversationId);

  // Agent mode state
  const [agentMode, setAgentMode] = useState(false);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(DEFAULT_TOOLS);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentResult, setAgentResult] = useState<string | null>(null);

  // Scroll al final SIN animación mientras llega el streaming. Con
  // behavior:"smooth" cada chunk reinicia la animación y compite con el render
  // (se ve a saltos). Solo se anima al enviar/terminar; durante el stream, "auto"
  // ya es suave porque el texto crece de a poco. Además se agrupa en un rAF.
  const scrollRaf = useRef<number | null>(null);
  useEffect(() => {
    if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: status === "streaming" ? "auto" : "smooth",
        block: "end",
      });
      scrollRaf.current = null;
    });
    return () => {
      if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current);
    };
  }, [messages, agentSteps, agentResult, status]);

  function toggleTool(tool: string) {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  }

  function resetAgent() {
    setAgentSteps([]);
    setAgentResult(null);
  }

  const runAgent = useCallback(
    async (input: string) => {
      if (agentRunning) return;
      setAgentRunning(true);
      setAgentSteps([]);
      setAgentResult(null);

      const addStep = (step: Omit<AgentStep, "id" | "timestamp">): string => {
        const id = Math.random().toString(36).slice(2);
        setAgentSteps((prev) => [
          ...prev,
          { ...step, id, timestamp: new Date().toLocaleTimeString() },
        ]);
        return id;
      };

      const updateStep = (id: string, patch: Partial<AgentStep>) => {
        setAgentSteps((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
        );
      };

      try {
        // Call the API agent endpoint (streaming)
        const res = await fetch("/api/agents/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input,
            tools: Array.from(selectedTools),
            model: "openai/gpt-oss-120b",
          }),
        });

        if (!res.ok) {
          // Fallback to simulated steps if API not configured
          await simulateAgent(input, addStep, updateStep, selectedTools);
        } else {
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          // Buffer: un evento SSE puede llegar partido entre dos chunks. Sin esto,
          // el JSON incompleto fallaba en silencio y se "perdía" un paso.
          let buffer = "";

          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Los eventos SSE terminan en línea en blanco
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? ""; // el último puede estar incompleto

            for (const evt of events) {
              const line = evt.trim();
              if (line === "data: [DONE]") continue;
              if (!line.startsWith("data: ")) continue;
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "step") addStep({ ...data.step, status: "done" });
                else if (data.type === "result") setAgentResult(data.content);
                else if (data.type === "error") setAgentResult(`No pude completar la tarea: ${data.message}`);
              } catch {
                /* evento malformado: se ignora */
              }
            }
          }
        }
      } catch {
        await simulateAgent(input, addStep, updateStep, selectedTools);
      } finally {
        setAgentRunning(false);
      }
    },
    [agentRunning, selectedTools]
  );

  function setAgent(on: boolean) {
    if (on === agentMode) return;
    setAgentMode(on);
    resetAgent();
  }

  async function handleSend(message: string, attachments: Attachment[] = []) {
    // Nota: los adjuntos se reciben y se listan en el mensaje, pero el backend
    // (/api/chat) hoy solo acepta texto. Se antepone el nombre de cada archivo
    // para no perder la referencia hasta que el endpoint soporte multimodal.
    const names = attachments.map((a) => `[${a.kind === "image" ? "Foto" : "Archivo"}: ${a.file.name}]`);
    const full = [...names, message].filter(Boolean).join("\n");
    if (!full.trim()) return;

    if (agentMode) {
      await runAgent(full);
    } else {
      send(full);
    }
  }

  const isEmpty = messages.length === 0 && agentSteps.length === 0 && !agentResult;

  return (
    <div className={cn("axis-chat-bg flex h-full flex-col", className)}>
      {/* Messages / Agent trace area */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <EmptyState agentMode={agentMode} onSend={handleSend} />
        ) : agentMode ? (
          /* Agent mode: show step trace */
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-3">
            {agentSteps.length > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">AI Agent</p>
                  <p className="text-xs text-muted-foreground">
                    {agentRunning
                      ? `Running… ${agentSteps.length} steps`
                      : `Completed in ${agentSteps.length} steps`}
                  </p>
                </div>
                {agentRunning ? (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground" />
                    Trabajando
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-xs text-muted-foreground"
                    onClick={resetAgent}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Limpiar
                  </Button>
                )}
              </div>
            )}

            {/* Steps trace */}
            {agentSteps
              .filter((s) => s.type !== "response")
              .map((step) => {
                // La calculadora se dibuja como calculadora, no como JSON:
                // solo en el resultado (evita duplicarla con la llamada).
                if (step.toolName === "calculator" && step.type === "tool_result") {
                  const expr = extractExpression(step.content);
                  return (
                    <div key={step.id} className="py-1">
                      <CalculatorCard expression={expr} />
                    </div>
                  );
                }
                if (step.toolName === "calculator" && step.type === "tool_call") return null;
                return <AgentStepCard key={step.id} step={step} />;
              })}

            {/* Final result */}
            {agentResult && (
              <div className="rounded-xl border bg-card p-5 mt-4">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Agent Response</span>
                </div>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {agentResult}
                </div>
              </div>
            )}

            {agentRunning && agentSteps.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="flex gap-1">
                  <span className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 bg-primary rounded-full animate-bounce" />
                </span>
                Agent initializing…
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        ) : (
          /* Normal chat mode */
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {/* Estado real de useChat: submitted / streaming(+reasoning) / error.
                En "ready" AxisStatus no renderiza nada. */}
            <AxisStatus status={status} isReasoning={isReasoning} />
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="axis-composer-zone relative z-10 px-3 pb-3 pt-6 sm:px-4">
        <div className="mx-auto max-w-3xl">
          <ChatInput
            onSend={handleSend}
            onStop={stop}
            isLoading={isLoading || agentRunning}
            agentMode={agentMode}
            selectedTools={selectedTools}
            onToggleAgent={setAgent}
            onToggleTool={toggleTool}
          />
          <p className="mt-2.5 text-center text-[11px] text-muted-foreground/50">
            AXIS puede equivocarse. Verifica la información importante.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  agentMode,
  onSend,
}: {
  agentMode: boolean;
  onSend: (msg: string) => void;
}) {
  const chatStarters = [
    "Explícame computación cuántica de forma simple",
    "Escribe una función en Python que parsee JSON",
    "Ayúdame a redactar un correo profesional",
    "Crea un plan de entrenamiento semanal",
  ];

  const agentStarters = [
    "Investiga los modelos de IA más recientes",
    "Resume los mejores LLMs open-source de hoy",
    "Calcula interés compuesto: $10,000 al 7% en 20 años",
    "Escribe y prueba un script en Python que ordene una lista",
  ];

  const starters = agentMode ? agentStarters : chatStarters;

  return (
    <div className="flex h-full flex-col items-center justify-center px-5 pb-6">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/80 bg-card">
        {agentMode ? (
          <Bot className="h-5 w-5 text-foreground" strokeWidth={1.5} />
        ) : (
          <Sparkles className="h-5 w-5 text-foreground" strokeWidth={1.5} />
        )}
      </div>
      <h2 className="mb-1.5 text-center text-[22px] font-semibold tracking-tight">
        {agentMode ? "Agent listo" : "¿En qué te ayudo?"}
      </h2>
      <p className="mb-8 max-w-xs text-center text-[13px] leading-relaxed text-muted-foreground">
        {agentMode
          ? "Planifica, usa herramientas y razona paso a paso para resolver tu tarea."
          : "Pregúntame lo que quieras: código, redacción, análisis y más."}
      </p>
      <div className="flex w-full max-w-md flex-col gap-2">
        {starters.map((starter) => (
          <button
            key={starter}
            onClick={() => onSend(starter)}
            className="rounded-2xl border border-border/70 px-4 py-3 text-left text-[13px] text-foreground/90 transition-colors hover:border-foreground/20 hover:bg-accent/60 active:scale-[0.99]"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  );
}

// Simulated agent execution when backend isn't configured
async function simulateAgent(
  input: string,
  addStep: (step: Omit<AgentStep, "id" | "timestamp">) => string,
  updateStep: (id: string, patch: Partial<AgentStep>) => void,
  selectedTools: Set<string>
) {
  addStep({
    type: "thought",
    content: `Task: "${input}"\n\nI'll break this into steps:\n1. Analyze the request\n2. Use available tools to gather information\n3. Synthesize a complete answer`,
    status: "done",
  });

  await delay(700);

  for (const tool of Array.from(selectedTools).slice(0, 2)) {
    const callId = addStep({
      type: "tool_call",
      content: `Executing ${tool} with input: "${input}"`,
      toolName: tool,
      status: "running",
    });

    await delay(1100);
    updateStep(callId, { status: "done" });

    addStep({
      type: "tool_result",
      content: `${tool} returned relevant results for: "${input}"\n\nKey data points collected:\n• Source 1: Relevant information found\n• Source 2: Additional context gathered\n• Source 3: Supporting details retrieved`,
      toolName: tool,
      status: "done",
    });

    await delay(500);
  }

  addStep({
    type: "thought",
    content: "All tool calls complete. Synthesizing final response from gathered information...",
    status: "done",
  });

  await delay(900);
}
