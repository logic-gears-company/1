import OpenAI from "openai";
import type { Tool } from "./tools";
import { getToolByName, toolsToOpenAIFormat } from "./tools";
import { InMemoryStore, type MemoryEntry } from "./memory";
import type { AgentStep } from "@ai-saas/shared";

export * from "./tools";
export * from "./memory";

export interface AgentConfig {
  name?: string;
  systemPrompt?: string;
  model?: string;
  maxIterations?: number;
  tools?: Tool[];
  temperature?: number;
}

export interface AgentRunOptions {
  input: string;
  userId: string;
  conversationId?: string;
  onStep?: (step: AgentStep) => void;
}

export class ReActAgent {
  private client: OpenAI;
  private config: Required<AgentConfig>;
  private memory: InMemoryStore;

  constructor(config: AgentConfig = {}) {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.config = {
      name: config.name ?? "AI Agent",
      systemPrompt:
        config.systemPrompt ??
        "You are a helpful AI assistant with access to tools. Use them when needed.",
      model: config.model ?? "gpt-4o-mini",
      maxIterations: config.maxIterations ?? 10,
      tools: config.tools ?? [],
      temperature: config.temperature ?? 0.7,
    };
    this.memory = new InMemoryStore(100_000);
  }

  async run(options: AgentRunOptions): Promise<{
    output: string;
    steps: AgentStep[];
    tokensUsed: number;
  }> {
    const { input, onStep } = options;
    const steps: AgentStep[] = [];
    let totalTokens = 0;

    // Seed memory with system prompt
    const systemEntry: MemoryEntry = {
      id: crypto.randomUUID(),
      content: this.config.systemPrompt,
      role: "system",
      timestamp: Date.now(),
    };
    this.memory.add(systemEntry);

    // Add user input
    const userEntry: MemoryEntry = {
      id: crypto.randomUUID(),
      content: input,
      role: "user",
      timestamp: Date.now(),
    };
    this.memory.add(userEntry);

    const tools = toolsToOpenAIFormat(this.config.tools);

    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      const messages = this.memory
        .getAll()
        .map((e) => ({ role: e.role as "user" | "assistant" | "system", content: e.content }));

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
        temperature: this.config.temperature,
      });

      const choice = response.choices[0];
      totalTokens += response.usage?.total_tokens ?? 0;

      if (choice.finish_reason === "stop" || !choice.message.tool_calls) {
        const output = choice.message.content ?? "";

        const thoughtStep: AgentStep = {
          id: crypto.randomUUID(),
          type: "response",
          content: output,
          timestamp: new Date().toISOString(),
        };
        steps.push(thoughtStep);
        onStep?.(thoughtStep);

        this.memory.add({
          id: crypto.randomUUID(),
          content: output,
          role: "assistant",
          timestamp: Date.now(),
          tokens: response.usage?.completion_tokens,
        });

        return { output, steps, tokensUsed: totalTokens };
      }

      // Handle tool calls
      const toolCalls = choice.message.tool_calls;

      this.memory.add({
        id: crypto.randomUUID(),
        content: JSON.stringify(toolCalls),
        role: "assistant",
        timestamp: Date.now(),
      });

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolInput = JSON.parse(toolCall.function.arguments);

        const callStep: AgentStep = {
          id: crypto.randomUUID(),
          type: "tool_call",
          content: `Calling ${toolName}`,
          toolName,
          toolInput,
          timestamp: new Date().toISOString(),
        };
        steps.push(callStep);
        onStep?.(callStep);

        let toolOutput: unknown;
        try {
          const tool = getToolByName(toolName);
          if (!tool) throw new Error(`Unknown tool: ${toolName}`);
          toolOutput = await tool.execute(toolInput);
        } catch (err) {
          toolOutput = { error: String(err) };
        }

        const resultStep: AgentStep = {
          id: crypto.randomUUID(),
          type: "tool_result",
          content: JSON.stringify(toolOutput),
          toolName,
          toolOutput,
          timestamp: new Date().toISOString(),
        };
        steps.push(resultStep);
        onStep?.(resultStep);

        this.memory.add({
          id: crypto.randomUUID(),
          content: JSON.stringify(toolOutput),
          role: "system",
          timestamp: Date.now(),
        });
      }
    }

    return {
      output: "Max iterations reached without a final answer.",
      steps,
      tokensUsed: totalTokens,
    };
  }
}

// ─── Multi-agent orchestration ────────────────────────────────────────────────

export interface AgentNode {
  id: string;
  name: string;
  agent: ReActAgent;
  systemPrompt?: string;
}

export class MultiAgentOrchestrator {
  private agents: Map<string, AgentNode> = new Map();

  register(node: AgentNode): void {
    this.agents.set(node.id, node);
  }

  async runSequential(
    agentIds: string[],
    initialInput: string,
    userId: string
  ): Promise<string> {
    let currentInput = initialInput;

    for (const agentId of agentIds) {
      const node = this.agents.get(agentId);
      if (!node) throw new Error(`Agent ${agentId} not found`);

      const result = await node.agent.run({ input: currentInput, userId });
      currentInput = result.output;
    }

    return currentInput;
  }

  async runParallel(
    agentIds: string[],
    input: string,
    userId: string
  ): Promise<Array<{ agentId: string; output: string }>> {
    const promises = agentIds.map(async (agentId) => {
      const node = this.agents.get(agentId);
      if (!node) throw new Error(`Agent ${agentId} not found`);
      const result = await node.agent.run({ input, userId });
      return { agentId, output: result.output };
    });

    return Promise.all(promises);
  }
}
