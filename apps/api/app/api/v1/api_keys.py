import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.core.security import generate_api_key
from app.models.api_key import ApiKey, ApiKeyStatus

router = APIRouter()


class ApiKeyCreate(BaseModel):
    name: str
    scopes: list[str] = []
    expires_at: datetime | None = None


@router.get("/")
async def list_api_keys(current_user: CurrentUser, db: DbDep):
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.user_id == current_user.id,
            ApiKey.status == ApiKeyStatus.ACTIVE,
        )
    )
    keys = result.scalars().all()
    return {
        "data": [
            {
                "id": k.id,
                "name": k.name,
                "keyPrefix": k.key_prefix,
                "scopes": [],
                "lastUsedAt": k.last_used_at,
                "expiresAt": k.expires_at,
                "requestCount": k.request_count,
                "createdAt": k.created_at,
            }
            for k in keys
        ]
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_api_key(body: ApiKeyCreate, current_user: CurrentUser, db: DbDep):
    full_key, prefix, key_hash = generate_api_key()

    api_key = ApiKey(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=body.name,
        key_hash=key_hash,
        key_prefix=prefix,
        expires_at=body.expires_at,
    )
    db.add(api_key)
    await db.flush()

    return {
        "id": api_key.id,
        "name": api_key.name,
        "key": full_key,  # Only returned once
        "keyPrefix": prefix,
        "createdAt": api_key.created_at,
    }


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(key_id: str, current_user: CurrentUser, db: DbDep):
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

    key.status = ApiKeyStatus.REVOKED
