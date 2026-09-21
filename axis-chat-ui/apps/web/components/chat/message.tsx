"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@ai-saas/shared";
import { cn } from "@/lib/utils";
import { CalculatorCard } from "@/components/chat/calculator-card";

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user";

  // Usuario: burbuja compacta a la derecha. Asistente: texto directo, sin caja
  // (más limpio y con más espacio para leer, como en los chats modernos).
  if (isUser) {
    return (
      <div className="flex animate-fade-in justify-end">
        <div className="max-w-[85%] rounded-[1.4rem] rounded-br-md bg-secondary px-4 py-2.5 text-foreground">
          <p className="whitespace-pre-wrap text-[15px] leading-6">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex animate-fade-in flex-col items-start gap-1">
      <div className="w-full max-w-none text-[15px] leading-7">
        <MarkdownContent content={message.content} />
      </div>
      {message.totalTokens ? (
        <span className="text-[10px] text-muted-foreground/60">
          {message.totalTokens.toLocaleString()} tokens
        </span>
      ) : null}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-7 prose-pre:p-0 prose-pre:bg-transparent"
      components={{
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
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
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
    <div className="my-3 overflow-hidden rounded-2xl border border-border/70">
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
}
