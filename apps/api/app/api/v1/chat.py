import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbDep
from app.models.chat import Conversation, Message, MessageRole
from app.services.ai_service import AIService

router = APIRouter()
ai_service = AIService()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str
    model: str = "gpt-4o-mini"
    provider: str = "openai"
    system_prompt: str | None = None
    temperature: float | None = 0.7
    max_tokens: int | None = None
    attachment_ids: list[str] = []


class ConversationCreate(BaseModel):
    title: str = "New Conversation"
    model: str = "gpt-4o-mini"
    provider: str = "openai"
    system_prompt: str | None = None


# ─── Conversations ────────────────────────────────────────────────────────────

@router.get("/conversations")
async def list_conversations(
    current_user: CurrentUser,
    db: DbDep,
    page: int = 1,
    page_size: int = 20,
    archived: bool = False,
):
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.user_id == current_user.id,
            Conversation.is_archived == archived,
        )
        .order_by(desc(Conversation.updated_at))
        .offset(offset)
        .limit(page_size)
    )
    conversations = result.scalars().all()
    return {"data": conversations, "page": page, "page_size": page_size}


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate, current_user: CurrentUser, db: DbDep
):
    conv = Conversation(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=body.title,
        model=body.model,
        provider=body.provider,
        system_prompt=body.system_prompt,
    )
    db.add(conv)
    await db.flush()
    return conv


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str, current_user: CurrentUser, db: DbDep
):
    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .options(selectinload(Conversation.messages))
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conv


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str, current_user: CurrentUser, db: DbDep
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    await db.delete(conv)


# ─── Streaming chat ───────────────────────────────────────────────────────────

@router.post("/completions")
async def chat_completion(body: ChatRequest, current_user: CurrentUser, db: DbDep):
    # Get or create conversation
    if body.conversation_id:
        result = await db.execute(
            select(Conversation)
            .where(
                Conversation.id == body.conversation_id,
                Conversation.user_id == current_user.id,
            )
            .options(selectinload(Conversation.messages))
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conv = Conversation(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            model=body.model,
            provider=body.provider,
            system_prompt=body.system_prompt,
        )
        db.add(conv)
        await db.flush()

    # Save user message
    user_msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conv.id,
        user_id=current_user.id,
        role=MessageRole.USER,
        content=body.message,
    )
    db.add(user_msg)
    await db.flush()

    # Build message history
    history = [
        {"role": m.role.value.lower(), "content": m.content}
        for m in (conv.messages if hasattr(conv, "messages") and conv.messages else [])
        if m.id != user_msg.id
    ]
    history.append({"role": "user", "content": body.message})

    async def stream_generator() -> AsyncGenerator[str, None]:
        full_content = ""
        prompt_tokens = 0
        completion_tokens = 0

        async for chunk in ai_service.stream_chat(
            messages=history,
            model=body.model,
            provider=body.provider,
            system_prompt=body.system_prompt or conv.system_prompt,
            temperature=body.temperature,
            max_tokens=body.max_tokens,
        ):
            if chunk["type"] == "content":
                full_content += chunk.get("content", "")
                yield f"data: {chunk['content']}\n\n"
            elif chunk["type"] == "done":
                prompt_tokens = chunk.get("usage", {}).get("prompt_tokens", 0)
                completion_tokens = chunk.get("usage", {}).get("completion_tokens", 0)

        # Persist assistant message
        assistant_msg = Message(
            id=str(uuid.uuid4()),
            conversation_id=conv.id,
            role=MessageRole.ASSISTANT,
            content=full_content,
            model=body.model,
            provider=body.provider,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        )
        db.add(assistant_msg)

        # Update conversation token count
        conv.total_tokens += prompt_tokens + completion_tokens
        current_user.tokens_used += prompt_tokens + completion_tokens

        # Auto-title if first message
        if conv.title == "New Conversation" and body.message:
            conv.title = body.message[:50]

        await db.commit()
        yield f"data: [DONE]\n\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Conversation-ID": conv.id,
        },
    )
