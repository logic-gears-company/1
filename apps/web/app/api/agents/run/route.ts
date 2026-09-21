import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

const schema = z.object({
  input: z.string().min(1).max(8000),
  tools: z.array(z.string()).default([]),
  model: z.string().default("gpt-4o-mini"),
  maxIterations: z.number().int().min(1).max(15).default(6),
});

const SYSTEM_PROMPT = `You are an autonomous AI agent with access to tools.

When given a task:
1. Think step-by-step about how to approach it
2. Use available tools when needed to gather information or perform actions
3. Synthesize your findings into a clear, comprehensive response

Always be accurate, helpful, and concise.`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { input, tools, model, maxIterations } = parsed.data;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-your")) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 503 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const { OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey });

        // Build tools for OpenAI function calling
        const openaiTools = buildOpenAITools(tools);

        const messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string; name?: string }> = [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: input },
        ];

        let totalTokens = 0;

        for (let i = 0; i < maxIterations; i++) {
          const response = await openai.chat.completions.create({
            model,
            messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
            tools: openaiTools.length > 0 ? openaiTools : undefined,
            tool_choice: openaiTools.length > 0 ? "auto" : undefined,
          });

          const choice = response.choices[0];
          totalTokens += response.usage?.total_tokens ?? 0;

          // Thought/reasoning step
          if (choice.message.content) {
            send({
              type: "step",
              step: {
                type: "thought",
                content: choice.message.content,
                status: "done",
              },
            });
          }

          // No tool calls → final answer
          if (!choice.message.tool_calls || choice.finish_reason === "stop") {
            send({ type: "result", content: choice.message.content ?? "" });
            break;
          }

          // Add assistant message with tool calls
          messages.push({
            role: "assistant",
            content: choice.message.content ?? "",
            tool_calls: choice.message.tool_calls,
          });

          // Execute each tool call
          for (const toolCall of choice.message.tool_calls) {
            const toolName = toolCall.function.name;
            const toolInput = JSON.parse(toolCall.function.arguments);

            // Tool call step
            send({
              type: "step",
              step: {
                type: "tool_call",
                content: JSON.stringify(toolInput, null, 2),
                toolName,
                status: "done",
              },
            });

            // Execute tool
            const toolOutput = await executeTool(toolName, toolInput);

            // Tool result step
            send({
              type: "step",
              step: {
                type: "tool_result",
                content: typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput, null, 2),
                toolName,
                status: "done",
              },
            });

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolName,
              content: JSON.stringify(toolOutput),
            });
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function buildOpenAITools(tools: string[]): ChatCompletionTool[] {
  const definitions: Record<string, ChatCompletionTool> = {
    web_search: {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the web for current information on any topic",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
          },
          required: ["query"],
        },
      },
    },
    calculator: {
      type: "function",
      function: {
        name: "calculator",
        description: "Evaluate mathematical expressions",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Math expression to evaluate e.g. '2 + 2 * 3'",
            },
          },
          required: ["expression"],
        },
      },
    },
    code_executor: {
      type: "function",
      function: {
        name: "code_executor",
        description: "Write and explain code solutions",
        parameters: {
          type: "object",
          properties: {
            language: { type: "string", enum: ["python", "javascript"] },
            code: { type: "string", description: "The code to write/explain" },
            description: { type: "string", description: "What the code does" },
          },
          required: ["language", "code", "description"],
        },
      },
    },
  };

  return tools
    .filter((t: string): t is keyof typeof definitions => t in definitions)
    .map((t) => definitions[t]);
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "web_search": {
      // In production, integrate Tavily/Serper/Brave
      const query = input.query as string;
      return {
        results: [
          {
            title: `Search results for: ${query}`,
            snippet: `Based on current information about "${query}": This is a comprehensive topic with multiple perspectives. Key aspects include recent developments, practical applications, and ongoing research in the field.`,
            url: "https://example.com/result-1",
          },
          {
            title: `${query} — Overview`,
            snippet: `${query} has seen significant advancement recently, with experts highlighting three key trends: increased adoption, improved tooling, and growing community support.`,
            url: "https://example.com/result-2",
          },
        ],
        query,
        status: "success",
      };
    }

    case "calculator": {
      try {
        const expr = (input.expression as string).replace(/[^0-9+\-*/().\s]/g, "");
        const result = Function(`"use strict"; return (${expr})`)();
        return { result, expression: input.expression };
      } catch {
        return { error: "Invalid expression", expression: input.expression };
      }
    }

    case "code_executor": {
      return {
        language: input.language,
        code: input.code,
        description: input.description,
        status: "written",
        note: "Code sandbox execution requires a sandboxed runtime service (e.g. E2B). Code is ready to run.",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
