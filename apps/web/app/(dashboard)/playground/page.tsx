"use client";

import { useState } from "react";
import { Send, Settings2, RotateCcw, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODELS = [
  { label: "GPT-4o mini", value: "gpt-4o-mini", provider: "openai" },
  { label: "GPT-4o", value: "gpt-4o", provider: "openai" },
  { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet-20241022", provider: "anthropic" },
  { label: "Claude 3.5 Haiku", value: "claude-3-5-haiku-20241022", provider: "anthropic" },
  { label: "Llama 3.2 (Ollama)", value: "llama3.2", provider: "ollama" },
];

export default function PlaygroundPage() {
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful AI assistant. Be concise and accurate."
  );
  const [userPrompt, setUserPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);

  async function run() {
    if (!userPrompt.trim() || isLoading) return;
    setIsLoading(true);
    setResponse("");
    setTokensUsed(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userPrompt,
          model: selectedModel.value,
          provider: selectedModel.provider,
          systemPrompt,
          temperature,
          maxTokens,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        // AI SDK data stream format
        const lines = chunk.split("\n").filter(Boolean);
        for (const line of lines) {
          if (line.startsWith("0:")) {
            try {
              const text = JSON.parse(line.slice(2));
              full += text;
              setResponse(full);
            } catch {}
          }
        }
      }
    } catch (err) {
      setResponse(`Error: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function copyResponse() {
    await navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background">
        <div>
          <h1 className="font-semibold">AI Playground</h1>
          <p className="text-xs text-muted-foreground">
            Test prompts and model configs interactively
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 className="h-4 w-4 mr-1" />
            Settings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setResponse(""); setUserPrompt(""); setTokensUsed(null); }}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Settings panel */}
        {showSettings && (
          <div className="w-64 border-r bg-muted/20 p-4 space-y-5 overflow-y-auto flex-shrink-0">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Model
              </label>
              <select
                value={selectedModel.value}
                onChange={(e) => {
                  const m = MODELS.find((m) => m.value === e.target.value);
                  if (m) setSelectedModel(m);
                }}
                className="w-full text-sm rounded-md border bg-background px-2 py-1.5 outline-none focus:ring-1 focus:ring-ring"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Temperature
                </label>
                <span className="text-xs font-mono text-foreground">{temperature}</span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Max tokens
                </label>
                <span className="text-xs font-mono text-foreground">{maxTokens}</span>
              </div>
              <input
                type="range"
                min={64}
                max={4096}
                step={64}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {tokensUsed !== null && (
              <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
                <p className="font-medium">Last run</p>
                <p className="text-muted-foreground">
                  {tokensUsed.toLocaleString()} tokens used
                </p>
              </div>
            )}
          </div>
        )}

        {/* Main panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* System prompt */}
          <div className="border-b p-4">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={2}
              className="w-full text-sm rounded-md border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-ring resize-none"
              placeholder="You are a helpful AI assistant..."
            />
          </div>

          {/* Response area */}
          <div className="flex-1 overflow-y-auto p-4">
            {response ? (
              <div className="relative">
                <div className="rounded-xl border bg-card p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {response}
                  {isLoading && (
                    <span className="inline-block h-4 w-0.5 bg-primary ml-1 animate-pulse" />
                  )}
                </div>
                {!isLoading && (
                  <button
                    onClick={copyResponse}
                    className="absolute top-2 right-2 p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Response will appear here
              </div>
            )}
          </div>

          {/* User prompt input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    run();
                  }
                }}
                rows={2}
                className="flex-1 text-sm rounded-md border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Enter your prompt here… (Enter to submit, Shift+Enter for new line)"
              />
              <Button
                onClick={run}
                disabled={!userPrompt.trim() || isLoading}
                className="self-end"
              >
                {isLoading ? (
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                  </span>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" /> Run
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
