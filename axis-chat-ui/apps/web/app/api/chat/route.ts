import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@ai-saas/database";
import { z } from "zod";

// Indica al modelo cómo pedir una calculadora interactiva en el chat.
// El cliente renderiza cualquier bloque ```calc como una calculadora funcional.
const UI_CAPABILITIES_PROMPT = `Cuando el usuario pida hacer un cálculo o una operación matemática, además de explicar el resultado puedes mostrar una calculadora interactiva escribiendo un bloque de código con el lenguaje "calc" que contenga SOLO la expresión (sin texto extra). Ejemplo:

\`\`\`calc
10000*(1+0.07)^20
\`\`\`

Usa únicamente números y los operadores + - * / % ^ y paréntesis. Úsalo solo para cálculos, no para otras respuestas.`;

const schema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(32_000),
  model: z.string().default("gpt-4o-mini"),
  provider: z.enum(["openai", "anthropic", "ollama"]).default("openai"),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { conversationId, message, model, provider, systemPrompt, temperature } =
    parsed.data;

  // Get or create conversation
  let conv = conversationId
    ? await prisma.conversation.findFirst({
        where: { id: conversationId, userId: session.user.id },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 50 } },
      })
    : null;

  if (!conv) {
    conv = await prisma.conversation.create({
      data: {
        userId: session.user.id,
        model,
        provider,
        systemPrompt,
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
  const history = (conv.messages ?? []).map((m: (typeof conv.messages)[number]) => ({
    role: m.role.toLowerCase() as "user" | "assistant",
    content: m.content,
  }));
  history.push({ role: "user", content: message });

  // Choose model
  let llm;
  if (provider === "anthropic") {
    llm = anthropic(model as Parameters<typeof anthropic>[0]);
  } else {
    llm = openai(model as Parameters<typeof openai>[0]);
  }

  const result = streamText({
    model: llm,
    system: [systemPrompt ?? conv.systemPrompt, UI_CAPABILITIES_PROMPT]
      .filter(Boolean)
      .join("\n\n"),
    messages: history,
    temperature,
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
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "X-Conversation-ID": conv.id,
    },
  });
}
