import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

type ProviderName = "groq" | "openrouter";

type KeyPool = {
  keys: string[];
  index: number;
};

const pools: Record<ProviderName, KeyPool> = {
  groq: {
    keys: getKeys("GROQ_API_KEYS"),
    index: 0,
  },
  openrouter: {
    keys: getKeys("OPENROUTER_API_KEYS"),
    index: 0,
  },
};

function getKeys(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

function nextKey(provider: ProviderName): string {
  const pool = pools[provider];

  if (pool.keys.length === 0) {
    throw new Error(`No API keys configured for ${provider}`);
  }

  const key = pool.keys[pool.index % pool.keys.length];
  pool.index = (pool.index + 1) % pool.keys.length;

  return key;
}

export function getGroqModel(model: string) {
  return createGroq({
    apiKey: nextKey("groq"),
  })(model);
}

export function getOpenRouterModel(model: string) {
  return createOpenAI({
    apiKey: nextKey("openrouter"),
    baseURL: "https://openrouter.ai/api/v1",
  })(model);
}

export function getOpenAIModel(model: string) {
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })(model);
}

export function getAnthropicModel(model: string) {
  return anthropic(model);
}

export function getProviderStats() {
  return {
    groq: pools.groq.keys.length,
    openrouter: pools.openrouter.keys.length,
  };
}
