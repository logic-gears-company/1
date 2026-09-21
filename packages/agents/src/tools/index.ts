import { z } from "zod";

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<TOutput>;
}

// ─── Built-in tools ───────────────────────────────────────────────────────────

export const webSearchTool: Tool<{ query: string }, string> = {
  name: "web_search",
  description: "Search the web for current information",
  schema: z.object({ query: z.string().describe("Search query") }),
  async execute({ query }) {
    // Integrate with Tavily, Serper, or Brave Search API
    const response = await fetch(
      `https://api.tavily.com/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.TAVILY_API_KEY ?? "",
        },
        body: JSON.stringify({ query, max_results: 5 }),
      }
    );
    const data = await response.json();
    return JSON.stringify(data.results ?? []);
  },
};

export const calculatorTool: Tool<{ expression: string }, number> = {
  name: "calculator",
  description: "Evaluate a mathematical expression safely",
  schema: z.object({
    expression: z.string().describe("Math expression, e.g. '2 + 2 * 3'"),
  }),
  async execute({ expression }) {
    // Safe math evaluation without eval()
    const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
    return Function(`"use strict"; return (${sanitized})`)() as number;
  },
};

export const codeExecutorTool: Tool<
  { code: string; language: string },
  { stdout: string; stderr: string; exitCode: number }
> = {
  name: "code_executor",
  description: "Execute code in a sandboxed environment",
  schema: z.object({
    code: z.string().describe("Code to execute"),
    language: z.enum(["python", "javascript"]).describe("Programming language"),
  }),
  async execute({ code, language }) {
    // Integrate with sandboxed execution service (e.g. Judge0, E2B)
    const response = await fetch(
      process.env.CODE_EXECUTOR_URL ?? "http://localhost:2358/submissions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: code,
          language_id: language === "python" ? 71 : 93,
          stdin: "",
        }),
      }
    );
    const result = await response.json();
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status?.id ?? 0,
    };
  },
};

export const ALL_TOOLS: Tool[] = [
  webSearchTool as Tool,
  calculatorTool as Tool,
  codeExecutorTool as Tool,
];

export function getToolByName(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function toolsToOpenAIFormat(tools: Tool[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema),
    },
  }));
}

function zodToJsonSchema(schema: z.ZodType): object {
  // Simplified — use zod-to-json-schema package in production
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodFieldToJson(value);
      if (!(value instanceof z.ZodOptional)) required.push(key);
    }
    return { type: "object", properties, required };
  }
  return { type: "string" };
}

function zodFieldToJson(field: z.ZodType): object {
  if (field instanceof z.ZodString) return { type: "string" };
  if (field instanceof z.ZodNumber) return { type: "number" };
  if (field instanceof z.ZodBoolean) return { type: "boolean" };
  if (field instanceof z.ZodEnum) return { type: "string", enum: field.options };
  if (field instanceof z.ZodOptional) return zodFieldToJson(field.unwrap());
  return { type: "string" };
}
