/**
 * Política pura del chat en servidor (README §6.1 y §6.2).
 *
 * Sin E/S ni dependencias: se prueba sin red ni BD. `route.ts` solo la invoca.
 *
 * Principio: el cliente PIDE, el servidor DECIDE. Ni el modelo, ni el proveedor,
 * ni el system prompt salen de la petición sin pasar por aquí.
 */

import { buildPersonaPrompt } from "./persona";

export type ChatProvider = "groq" | "openrouter" | "openai" | "anthropic";

export interface ChatTarget {
  provider: ChatProvider;
  model: string;
}

/**
 * Lista blanca proveedor -> modelos permitidos.
 *
 * Hoy solo figura el par que YA funcionaba hardcodeado en `route.ts`
 * (groq + openai/gpt-oss-120b). Los proveedores de pago (openai, anthropic)
 * quedan FUERA a propósito: pedirlos desde el cliente gastaba las claves del
 * servidor (§6.1). Para habilitar más modelos, amplía esta tabla (o inyecta otra
 * en `resolveChatTarget`); no hace falta tocar la lógica.
 */
export const CHAT_ALLOWLIST: Readonly<Record<string, readonly string[]>> = Object.freeze({
  groq: Object.freeze(["openai/gpt-oss-120b"]),
});

export const DEFAULT_CHAT_TARGET: Readonly<ChatTarget> = Object.freeze({
  provider: "groq",
  model: "openai/gpt-oss-120b",
});

/**
 * Devuelve un destino válido. Si lo pedido no está EXACTAMENTE en la lista blanca,
 * devuelve el destino por defecto (no lanza: el chat debe seguir respondiendo).
 *
 * Usa `Object.hasOwn` para que claves como `__proto__` o `constructor` no
 * "existan" en la tabla por herencia de prototipo.
 */
export function resolveChatTarget(
  requested: { provider?: string; model?: string },
  allowlist: Readonly<Record<string, readonly string[]>> = CHAT_ALLOWLIST,
): ChatTarget {
  const { provider, model } = requested;
  if (typeof provider !== "string" || typeof model !== "string") {
    return { ...DEFAULT_CHAT_TARGET };
  }
  if (!Object.hasOwn(allowlist, provider)) return { ...DEFAULT_CHAT_TARGET };
  const models = allowlist[provider]!;
  if (!models.includes(model)) return { ...DEFAULT_CHAT_TARGET };
  return { provider: provider as ChatProvider, model };
}

/**
 * System prompt BASE del servidor: la personalidad de AXIS (`persona.ts`, README §11.1).
 *
 * Se mantiene el nombre `SERVER_BASE_SYSTEM_PROMPT` porque `route.ts` y sus tests
 * lo importan: solo cambia el VALOR, no el contrato.
 */
export const SERVER_BASE_SYSTEM_PROMPT: string = buildPersonaPrompt();

/**
 * Devuelve SIEMPRE el prompt del servidor. No recibe parámetros a propósito:
 * ni el `systemPrompt` del cuerpo de la petición ni el persistido en la
 * conversación pueden influir (antes del arreglo, /api/chat guardaba ahí el
 * prompt del cliente; esas filas antiguas están potencialmente envenenadas y
 * no deben seguir aplicándose).
 */
export function resolveSystemPrompt(): string {
  return SERVER_BASE_SYSTEM_PROMPT;
}

/**
 * Los N mensajes MÁS RECIENTES, en orden cronológico ascendente.
 *
 * Corrige §6.2: `orderBy: asc` + `take: 50` devolvía los 50 más ANTIGUOS, así que
 * en conversaciones largas el modelo perdía el contexto reciente.
 *
 * Recibe la lista en orden ascendente (como la entrega la BD) y no la muta.
 */
export function historyWindow<T>(messagesAsc: readonly T[], limit: number): T[] {
  if (!Number.isFinite(limit)) return [];
  const n = Math.floor(limit);
  if (n <= 0) return [];
  return messagesAsc.slice(-n);
}
