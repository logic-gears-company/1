import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { smoothStream, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@ai-saas/database";
import {
  getAnthropicModel,
  getGroqModel,
  getOpenAIModel,
  getOpenRouterModel,
} from "@/lib/ai/provider-router";
import { z } from "zod";
import { generateText } from "ai";
import { loadUserContext } from "@/lib/memory/context";
import { checkChatRateLimit } from "@/lib/rate-limit";
import { learnFromMessage } from "@/lib/memory/learn";
import { touchMemoriesUsed } from "@/lib/memory/usage-store";
import {
  historyWindow,
  resolveChatTarget,
  resolveSystemPrompt,
} from "@/lib/ai/chat-policy";

// Indica al modelo cómo pedir una calculadora interactiva en el chat.
// El cliente renderiza cualquier bloque ```calc como una calculadora funcional.
const UI_CAPABILITIES_PROMPT = `Cuando el usuario pida hacer un cálculo o una operación matemática, además de explicar el resultado puedes mostrar una calculadora interactiva escribiendo un bloque de código con el lenguaje "calc" que contenga SOLO la expresión (sin texto extra). Ejemplo:

\`\`\`calc
10000*(1+0.07)^20
\`\`\`

Usa únicamente números y los operadores + - * / % ^ y paréntesis. Úsalo solo para cálculos, no para otras respuestas.`;

// Streaming: siempre Node (Prisma no corre en edge) y nunca cacheado/estático.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mensajes recientes que se envían al modelo como historial.
const HISTORY_LIMIT = 50;

const schema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(32_000),
  model: z.string().default("openai/gpt-oss-120b"),
  provider: z
    .enum(["openai", "anthropic", "groq", "openrouter"])
    .default("groq"),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await checkChatRateLimit(session.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many messages", retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { conversationId, message, temperature } = parsed.data;

  // §6.1: el cliente PIDE, el servidor DECIDE. Modelo/proveedor salen de una lista blanca
  // y el system prompt es siempre el del servidor (se ignora el del body y el persistido).
  const { provider, model } = resolveChatTarget({
    provider: parsed.data.provider,
    model: parsed.data.model,
  });

  // Get or create conversation
  let conv = conversationId
    ? await prisma.conversation.findFirst({
        where: { id: conversationId, userId: session.user.id },
        include: { messages: { orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT } },
      })
    : null;

  if (!conv) {
    conv = await prisma.conversation.create({
      data: {
        userId: session.user.id,
        model,
        provider,
        title: message.slice(0, 50),
      },
      include: { messages: true },
    });
  }

  // Save user message
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      userId: session.user.id,
      role: "USER",
      content: message,
    },
  });

  // Build history
  // La consulta trae los más recientes en orden DESC; se invierte a cronológico.
  const recentAsc = historyWindow([...(conv.messages ?? [])].reverse(), HISTORY_LIMIT);
  const history = recentAsc.map((m: (typeof conv.messages)[number]) => ({
    role: m.role.toLowerCase() as "user" | "assistant",
    content: m.content,
  }));
  history.push({ role: "user", content: message });

  // Choose model/provider
  let llm;

  switch (provider) {
    case "groq":
      llm = getGroqModel(model);
      break;

    case "openrouter":
      llm = getOpenRouterModel(model);
      break;

    case "anthropic":
      llm = getAnthropicModel(model);
      break;

    case "openai":
    default:
      llm = getOpenAIModel(model);
      break;
  }

  // Contexto de memoria (nunca lanza; tiene timeout propio; respeta memory_enabled).
  const userCtx = await loadUserContext(session.user.id, {
    userName: session.user.name,
    query: message,
  });

  const result = streamText({
    model: llm,
    system: [resolveSystemPrompt(), userCtx.text, UI_CAPABILITIES_PROMPT]
      .filter(Boolean)
      .join("\n\n"),
    messages: history,
    temperature,
    // Groq entrega tokens en ráfagas: sin esto llegan "de golpe" al cliente.
    // smoothStream re-emite el texto palabra a palabra a ritmo constante.
    // Regex con \S+\s+ (palabra + espacio) también funciona con español/tildes.
    experimental_transform: smoothStream({
      delayInMs: 12,
      chunking: /\S+\s+/,
    }),
    onFinish: async ({ text, usage }) => {
      await prisma.message.create({
        data: {
          conversationId: conv!.id,
          role: "ASSISTANT",
          content: text,
          model,
          provider,
          promptTokens: usage?.inputTokens,
          completionTokens: usage?.outputTokens,
          totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
        },
      });
      await prisma.conversation.update({
        where: { id: conv!.id },
        data: {
          totalTokens: {
            increment: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
          },
        },
      });
      // Marcar las memorias usadas en segundo plano (debounce + un solo UPDATE).
      // `Promise.resolve().then` contiene tanto un throw síncrono como un rechazo:
      // un `void f()` a secas dejaría un unhandledRejection (mata el proceso en Node ≥15).
      void Promise.resolve()
        .then(() => touchMemoriesUsed(session.user.id, userCtx.memoryUsage))
        .catch(() => {});
      // Aprender en segundo plano: sin await, nunca bloquea ni rompe el chat.
      // Misma envoltura que arriba: `learnFromMessage` captura todo internamente, pero un
      // `void f()` a secas dejaría un unhandledRejection si algún día dejara de hacerlo.
      void Promise.resolve()
        .then(() =>
          learnFromMessage({
            userId: session.user.id,
            conversationId: conv!.id,
            message,
            settings: userCtx.settings,
            callModel: async ({ system, user, signal }) =>
              (await generateText({ model: llm, system, prompt: user, temperature: 0, abortSignal: signal })).text,
          })
        )
        .catch(() => {});
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "X-Conversation-ID": conv.id,
      // Evita que nginx / proxies / Vercel acumulen la respuesta en un buffer
      // y la suelten a bloques (causa clásica de "se traba y aparece de golpe").
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
