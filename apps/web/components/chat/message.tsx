"use client";

import React, { memo, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@ai-saas/shared";
import { cn } from "@/lib/utils";
import { CalculatorCard } from "@/components/chat/calculator-card";

export const ChatMessage = memo(function ChatMessage({
  message,
}: {
  message: ChatMessageType;
}) {
  const isUser = message.role === "user";

  // Usuario: burbuja compacta a la derecha, con material (cristal tenue + borde
  // alpha) en vez de un bloque plano. Asistente: texto limpio, sin caja, con
  // ancho de lectura cómodo. La entrada es corta y se anula con reduced-motion.
  if (isUser) {
    return (
      <div className="flex animate-msg-in justify-end motion-reduce:animate-none">
        <div
          className={cn(
            "max-w-[84%] rounded-[1.35rem] rounded-br-[0.5rem] px-4 py-2.5 text-foreground sm:max-w-[75%]",
            "border border-white/[0.07] bg-white/[0.06]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_4px_16px_rgba(0,0,0,.25)]"
          )}
        >
          <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.55] tracking-[-0.005em]">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex animate-msg-in flex-col items-start gap-1.5 motion-reduce:animate-none">
      <div className="w-full max-w-[42rem] break-words text-[15px] leading-[1.7] text-foreground/[0.92]">
        <MarkdownContent content={message.content} />
      </div>
      {message.totalTokens ? (
        <span className="text-[10px] text-muted-foreground/50">
          {message.totalTokens.toLocaleString()} tokens
        </span>
      ) : null}
    </div>
  );
});

const REMARK_PLUGINS = [remarkGfm];

const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    if (!match) {
      return (
        <code
          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] before:content-none after:content-none"
          {...props}
        >
          {children}
        </code>
      );
    }
    const code = String(children).trim();
    // Bloque ```calc 12*(3+4)  →  calculadora interactiva en el chat
    if (match[1] === "calc" || match[1] === "calculator") {
      return <CalculatorCard expression={code} className="my-3" />;
    }
    return <CodeBlock language={match[1]} code={code} />;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-foreground/25 underline-offset-2 hover:decoration-foreground"
      >
        {children}
      </a>
    );
  },
};

const MARKDOWN_CLASS =
  "prose prose-sm max-w-none dark:prose-invert prose-p:my-3 prose-p:leading-[1.7] prose-headings:tracking-tight prose-li:my-1 prose-pre:p-0 prose-pre:bg-transparent";

/**
 * Parte el markdown en bloques de nivel superior (separados por línea en blanco,
 * SIN cortar dentro de un bloque ``` abierto). Los bloques ya cerrados no cambian
 * mientras llega el streaming, así que memoizados por texto no se re-parsean:
 * solo se procesa el ÚLTIMO bloque, que es el que está creciendo.
 */
function splitBlocks(content: string): string[] {
  const blocks: string[] = [];
  let current = "";
  let inFence = false;

  for (const line of content.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "" && current.trim() !== "") {
      blocks.push(current);
      current = "";
    } else {
      current += line + "\n";
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

const MarkdownBlock = memo(function MarkdownBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      className={MARKDOWN_CLASS}
      components={MARKDOWN_COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  );
});

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const blocks = useMemo(() => splitBlocks(content), [content]);
  return (
    <>
      {blocks.map((block, i) => (
        // key por índice: los bloques cerrados son estables; solo el último cambia.
        <MarkdownBlock key={i} content={block} />
      ))}
    </>
  );
});

const CodeBlock = memo(function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard no disponible (http sin permiso): se ignora */
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_6px_24px_rgba(0,0,0,.3)]">
      <div className="flex items-center justify-between bg-zinc-900 px-4 py-2">
        <span className="font-mono text-[11px] text-zinc-400">{language}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar código"
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] text-zinc-400 transition-colors",
            "hover:bg-zinc-800 hover:text-white"
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: ".8rem" }}
        showLineNumbers
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
});
