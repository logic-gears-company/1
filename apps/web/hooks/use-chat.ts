"use client";

import { useChat as useAIChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useMemo, useRef } from "react";
import type { ChatMessage } from "@ai-saas/shared";

function textFromParts(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function useChat(conversationId?: string) {
  // Id de la conversación tal y como la conoce el SERVIDOR (cuid de la BD).
  // No es el `id` interno del SDK: ese es un id aleatorio del lado cliente que
  // /api/chat nunca reconocería, y enviarlo haría que cada mensaje creara una
  // conversación nueva (y el modelo perdiera todo el historial).
  const serverConversationId = useRef<string | undefined>(conversationId);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // /api/chat responde con la cabecera X-Conversation-ID (la conversación
        // que encontró o acaba de crear). La guardamos para los mensajes siguientes.
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const id = res.headers.get("X-Conversation-ID");
          if (id) serverConversationId.current = id;
          return res;
        },
        // The server expects { conversationId, message }, not the raw
        // UIMessage[] array the AI SDK sends by default — repack it here
        // so the client and /api/chat keep speaking the same protocol.
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          return {
            body: {
              conversationId: serverConversationId.current,
              message: lastMessage ? textFromParts(lastMessage.parts) : "",
            },
          };
        },
      }),
    []
  );

  // IMPORTANTE: `useChat` de @ai-sdk/react comprueba `"id" in options`. Si la
  // clave `id` existe aunque valga `undefined`, compara `chat.id !== undefined`
  // en CADA render y recrea el Chat entero: los mensajes nunca llegan a la UI
  // (ni el del usuario ni el streaming de la IA). Por eso solo se incluye la
  // clave cuando hay un id real.
  const { messages, status, stop, error, setMessages, sendMessage } = useAIChat({
    ...(conversationId ? { id: conversationId } : {}),
    transport,
    // Agrupa las actualizaciones de estado a ~1 cada 50 ms. Sin esto, cada
    // token dispara un re-render completo de la lista y del markdown.
    experimental_throttle: 50,
  });

  const isLoading = status === "submitted" || status === "streaming";

  const isReasoning =
    status === "streaming" &&
    messages.some((m) =>
      m.parts.some((part) => {
        const type = String(part.type);
        return type === "reasoning" || type === "data-reasoning";
      })
    );

  const send = useCallback(
    (message: string) => {
      sendMessage({ text: message });
    },
    [sendMessage]
  );

  const clear = useCallback(() => {
    setMessages([]);
    // Un chat vacío es una conversación nueva: no seguir escribiendo en la anterior.
    serverConversationId.current = undefined;
  }, [setMessages]);

  // Map AI SDK UIMessages (parts-based) to our shared ChatMessage type
  // useMemo: sin él se crea un array (y objetos) nuevos en CADA render, lo que
  // invalida el memo de <ChatMessage> y dispara el efecto de scroll sin motivo.
  const chatMessages: ChatMessage[] = useMemo(
    () =>
      messages.map((m) => ({
        id: m.id,
        role: m.role as ChatMessage["role"],
        content: textFromParts(m.parts),
      })),
    [messages]
  );

  return {
    messages: chatMessages,
    isLoading,
    status,
    isReasoning,
    error,
    send,
    clear,
    stop,
  };
}
