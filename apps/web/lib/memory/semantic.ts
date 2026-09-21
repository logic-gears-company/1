/**
 * Semantic memory layer.
 *
 * Stores one embedding per active memory and retrieves memories relevant to the
 * current user message. pgvector queries are always scoped by userId.
 * Embedding failures are best-effort: AXIS falls back to the deterministic
 * memory ranking instead of breaking the conversation.
 */
import { createHash } from "node:crypto";
import { Prisma, prisma } from "@ai-saas/database";
import { embedQuery, embedTexts, EmbeddingError } from "@/lib/embeddings";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("memory.semantic");
const QUERY_MAX_CHARS = 2000;
const MEMORY_TEXT_MAX_CHARS = 1800;
const DEFAULT_LIMIT = 8;

export interface SemanticMemoryHit {
  id: string;
  relevance: number;
}

function memoryText(input: { category: string; key: string; value: string }): string {
  return `${input.category}.${input.key}: ${input.value}`.slice(0, MEMORY_TEXT_MAX_CHARS);
}

function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function toHalfvecLiteral(vector: number[]): string {
  return `[${vector.map((n) => Number(n).toString()).join(",")}]`;
}

/** Best-effort embedding for a single memory. Never throws. */
export async function syncMemoryEmbedding(userId: string, memory: {
  id: string;
  category: string;
  key: string;
  value: string;
}): Promise<void> {
  try {
    if (!userId || !memory.id) return;
    const text = memoryText(memory);
    const contentHash = hashContent(text);

    const existing = await prisma.memoryEmbedding.findUnique({
      where: { memoryId: memory.id },
      select: { contentHash: true },
    });
    if (existing?.contentHash === contentHash) return;

    const result = await embedTexts([text], {
      purpose: "document",
      operation: "memory_store",
    });
    const vector = result.vectors[0];
    if (!vector) return;

    const literal = toHalfvecLiteral(vector);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO memory_embeddings (memory_id, user_id, embedding, model, content_hash, created_at)
      VALUES (${memory.id}, ${userId}, CAST(${literal} AS halfvec), ${result.model}, ${contentHash}, NOW())
      ON CONFLICT (memory_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        embedding = EXCLUDED.embedding,
        model = EXCLUDED.model,
        content_hash = EXCLUDED.content_hash,
        created_at = NOW()
    `);
  } catch (err) {
    // Free-tier quota/network problems must never affect the chat or memory CRUD.
    if (err instanceof EmbeddingError && err.code === "BUDGET_EXHAUSTED") {
      log.info("memory.embedding_budget", { userId, memoryId: memory.id });
    } else {
      log.warn("memory.embedding_failed", { userId, memoryId: memory.id, err });
    }
  }
}

/** Best-effort semantic lookup. Returns only ids + relevance. */
export async function searchSemanticMemories(
  userId: string,
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {}
): Promise<SemanticMemoryHit[]> {
  const text = query.trim().slice(0, QUERY_MAX_CHARS);
  if (!text) return [];

  try {
    // Avoid spending a Cohere call when this account has no semantic vectors yet.
    const existing = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM memory_embeddings
        WHERE user_id = ${userId}
      ) AS exists
    `);
    if (!existing[0]?.exists) return [];

    const vector = await embedQuery(text, {
      operation: "memory_query",
      signal: opts.signal,
    });
    if (!vector?.length) return [];

    const literal = toHalfvecLiteral(vector);
    const limit = Math.min(Math.max(Math.floor(opts.limit ?? DEFAULT_LIMIT), 1), 20);

    const rows = await prisma.$queryRaw<Array<{ id: string; distance: number }>>(Prisma.sql`
      SELECT m.id,
             (e.embedding <=> CAST(${literal} AS halfvec))::double precision AS distance
      FROM memory_embeddings e
      INNER JOIN user_memories m ON m.id = e.memory_id
      WHERE e.user_id = ${userId}
        AND m.user_id = ${userId}
        AND m.status = 'active'
        AND (m.expires_at IS NULL OR m.expires_at > NOW())
      ORDER BY e.embedding <=> CAST(${literal} AS halfvec)
      LIMIT ${limit}
    `);

    return rows
      .map((row) => ({ id: row.id, relevance: Math.max(0, Math.min(1, 1 - Number(row.distance))) }))
      .filter((row) => Number.isFinite(row.relevance));
  } catch (err) {
    log.info("memory.semantic_degraded", { userId, err });
    return [];
  }
}
