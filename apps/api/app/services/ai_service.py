from typing import AsyncGenerator, Any
import anthropic
import openai

from app.core.config import settings


class AIService:
    def __init__(self):
        self._openai: openai.AsyncOpenAI | None = None
        self._anthropic: anthropic.AsyncAnthropic | None = None

    @property
    def openai_client(self) -> openai.AsyncOpenAI:
        if not self._openai:
            self._openai = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._openai

    @property
    def anthropic_client(self) -> anthropic.AsyncAnthropic:
        if not self._anthropic:
            self._anthropic = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._anthropic

    async def stream_chat(
        self,
        messages: list[dict],
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        system_prompt: str | None = None,
        temperature: float | None = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncGenerator[dict, None]:
        if provider == "anthropic":
            async for chunk in self._stream_anthropic(
                messages, model, system_prompt, temperature, max_tokens
            ):
                yield chunk
        elif provider == "ollama":
            async for chunk in self._stream_ollama(
                messages, model, system_prompt, temperature, max_tokens
            ):
                yield chunk
        else:
            async for chunk in self._stream_openai(
                messages, model, system_prompt, temperature, max_tokens
            ):
                yield chunk

    async def _stream_openai(
        self,
        messages: list[dict],
        model: str,
        system_prompt: str | None,
        temperature: float | None,
        max_tokens: int | None,
    ) -> AsyncGenerator[dict, None]:
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        stream = await self.openai_client.chat.completions.create(
            model=model,
            messages=full_messages,
            temperature=temperature or 0.7,
            max_tokens=max_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )

        usage = {}
        async for event in stream:
            delta = event.choices[0].delta if event.choices else None
            if delta and delta.content:
                yield {"type": "content", "content": delta.content}
            if event.usage:
                usage = {
                    "prompt_tokens": event.usage.prompt_tokens,
                    "completion_tokens": event.usage.completion_tokens,
                }

        yield {"type": "done", "usage": usage}

    async def _stream_anthropic(
        self,
        messages: list[dict],
        model: str,
        system_prompt: str | None,
        temperature: float | None,
        max_tokens: int | None,
    ) -> AsyncGenerator[dict, None]:
        async with self.anthropic_client.messages.stream(
            model=model,
            max_tokens=max_tokens or 4096,
            system=system_prompt or "You are a helpful assistant.",
            messages=messages,
            temperature=temperature or 0.7,
        ) as stream:
            async for text in stream.text_stream:
                yield {"type": "content", "content": text}

            final = await stream.get_final_message()
            yield {
                "type": "done",
                "usage": {
                    "prompt_tokens": final.usage.input_tokens,
                    "completion_tokens": final.usage.output_tokens,
                },
            }

    async def _stream_ollama(
        self,
        messages: list[dict],
        model: str,
        system_prompt: str | None,
        temperature: float | None,
        max_tokens: int | None,
    ) -> AsyncGenerator[dict, None]:
        import httpx

        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        async with httpx.AsyncClient(base_url=settings.OLLAMA_BASE_URL) as client:
            async with client.stream(
                "POST",
                "/api/chat",
                json={
                    "model": model,
                    "messages": full_messages,
                    "stream": True,
                    "options": {"temperature": temperature or 0.7},
                },
                timeout=120,
            ) as response:
                import json
                async for line in response.aiter_lines():
                    if line:
                        data = json.loads(line)
                        if data.get("message", {}).get("content"):
                            yield {"type": "content", "content": data["message"]["content"]}
                        if data.get("done"):
                            yield {"type": "done", "usage": {}}

    async def create_embedding(
        self, text: str, model: str | None = None
    ) -> list[float]:
        model = model or settings.EMBEDDING_MODEL
        response = await self.openai_client.embeddings.create(
            input=text,
            model=model,
            dimensions=settings.EMBEDDING_DIMENSIONS,
        )
        return response.data[0].embedding

    async def create_embeddings_batch(
        self, texts: list[str], model: str | None = None
    ) -> list[list[float]]:
        model = model or settings.EMBEDDING_MODEL
        response = await self.openai_client.embeddings.create(
            input=texts,
            model=model,
            dimensions=settings.EMBEDDING_DIMENSIONS,
        )
        return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
