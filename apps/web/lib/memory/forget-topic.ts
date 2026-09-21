/**
 * "Olvida todo lo relacionado con X" [§37]: localiza y borra memorias por texto.
 *
 * Dos pasos, para que el usuario vea antes de borrar (README §6.9):
 *   1. `previewTopic`  → SOLO LECTURA: qué memorias coinciden (sin `userId`).
 *   2. `forgetTopic`   → borra. Si se le pasan `ids` (los de la vista previa),
 *                        borra EXACTAMENTE esos, intersectados con las que siguen
 *                        coincidiendo. Así "lo que viste" y "lo que se borra" no
 *                        pueden divergir si los datos cambian entre medias.
 *
 * Vista previa y borrado comparten `topicWhere`: una sola definición de "coincide".
 * Todas las consultas llevan `userId` (anti-IDOR; ver store.ts).
 */
import { prisma, Prisma } from "@ai-saas/database";

/** Cota de resultados de la vista previa (la UI no necesita más; evita respuestas enormes). */
export const PREVIEW_LIMIT = 50;

export interface TopicMatch {
  id: string;
  category: string;
  value: string;
}

export interface TopicPreview {
  /** Total real de coincidencias (puede superar `matches.length`). */
  total: number;
  matches: TopicMatch[];
}

export function normalizeTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, " ").slice(0, 80);
}

/** Un tema de 1 letra borraría medio perfil: se rechaza. */
export function isValidTopic(topic: string): boolean {
  return normalizeTopic(topic).length >= 2;
}

/** Definición ÚNICA de "esta memoria coincide con el tema" (vista previa y borrado). */
export function topicWhere(userId: string, topic: string): Prisma.UserMemoryWhereInput {
  return {
    userId,
    status: "active",
    OR: [
      { key: { contains: topic.replace(/\s+/g, "_"), mode: "insensitive" } },
      { value: { contains: topic, mode: "insensitive" } },
    ],
  };
}

/** Vista previa: no modifica nada. Devuelve `{ total: 0, matches: [] }` si el tema no es válido. */
export async function previewTopic(userId: string, rawTopic: string): Promise<TopicPreview> {
  const topic = normalizeTopic(rawTopic);
  if (topic.length < 2) return { total: 0, matches: [] };
  const where = topicWhere(userId, topic);
  const [total, rows] = await Promise.all([
    prisma.userMemory.count({ where }),
    prisma.userMemory.findMany({
      where,
      select: { id: true, category: true, value: true },
      orderBy: { updatedAt: "desc" },
      take: PREVIEW_LIMIT,
    }),
  ]);
  return { total, matches: rows };
}

/**
 * Borra las memorias que coinciden. Con `ids`, solo las de esa lista que además
 * sigan coincidiendo y sean del usuario. Devuelve cuántas se borraron.
 */
export async function forgetTopic(userId: string, rawTopic: string, ids?: readonly string[]): Promise<number> {
  const topic = normalizeTopic(rawTopic);
  if (topic.length < 2) return 0;
  const base = topicWhere(userId, topic);
  // `ids: []` (lista vacía) significa "nada que borrar", NO "borra todo lo que coincida".
  if (ids !== undefined && ids.length === 0) return 0;
  const where: Prisma.UserMemoryWhereInput = ids ? { AND: [base, { id: { in: [...ids] } }] } : base;
  const res = await prisma.userMemory.deleteMany({ where });
  return res.count;
}
