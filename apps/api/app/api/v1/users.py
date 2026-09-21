from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, func

from app.api.deps import CurrentUser, DbDep
from app.models.user import User
from app.models.chat import Conversation, Message

router = APIRouter()


class ProfileUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None
    company: str | None = None
    website: str | None = None
    timezone: str | None = None
    locale: str | None = None


@router.get("/me")
async def get_profile(current_user: CurrentUser):
    return current_user


@router.patch("/me")
async def update_profile(body: ProfileUpdate, current_user: CurrentUser, db: DbDep):
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(current_user, field, value)
    await db.commit()
    return current_user


@router.get("/me/usage")
async def get_usage(current_user: CurrentUser, db: DbDep):
    msg_count = await db.scalar(
        select(func.count()).select_from(Message).where(
            Message.user_id == current_user.id
        )
    )
    conv_count = await db.scalar(
        select(func.count()).select_from(Conversation).where(
            Conversation.user_id == current_user.id
        )
    )
    return {
        "tokensUsed": current_user.tokens_used,
        "messagesUsed": current_user.messages_used,
        "storageUsed": current_user.storage_used,
        "conversationCount": conv_count or 0,
        "messageCount": msg_count or 0,
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(current_user: CurrentUser, db: DbDep):
    from datetime import datetime, timezone
    current_user.deleted_at = datetime.now(timezone.utc)
    current_user.email = f"deleted_{current_user.id}@deleted.invalid"
    await db.commit()
