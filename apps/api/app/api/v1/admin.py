from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload

from app.api.deps import AdminUser, DbDep
from app.models.user import User
from app.models.billing import Subscription
from app.models.chat import Conversation, Message

router = APIRouter()


@router.get("/stats")
async def get_admin_stats(current_user: AdminUser, db: DbDep):
    total_users = await db.scalar(select(func.count()).select_from(User).where(User.deleted_at.is_(None)))
    active_subs = await db.scalar(
        select(func.count()).select_from(Subscription).where(Subscription.status == "ACTIVE")
    )
    total_messages = await db.scalar(select(func.count()).select_from(Message))
    total_conversations = await db.scalar(select(func.count()).select_from(Conversation))

    return {
        "totalUsers": total_users or 0,
        "activeSubscriptions": active_subs or 0,
        "totalMessages": total_messages or 0,
        "totalConversations": total_conversations or 0,
    }


@router.get("/users")
async def list_users(
    current_user: AdminUser,
    db: DbDep,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
):
    offset = (page - 1) * page_size
    query = select(User).where(User.deleted_at.is_(None))

    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) | (User.name.ilike(f"%{search}%"))
        )

    total = await db.scalar(
        select(func.count()).select_from(query.subquery())
    )
    result = await db.execute(
        query.order_by(desc(User.created_at)).offset(offset).limit(page_size)
    )
    users = result.scalars().all()

    return {
        "data": users,
        "meta": {
            "total": total or 0,
            "page": page,
            "pageSize": page_size,
            "totalPages": ((total or 0) + page_size - 1) // page_size,
        },
    }


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str, role: str, current_user: AdminUser, db: DbDep
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from app.models.user import UserRole
    try:
        user.role = UserRole[role.upper()]
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role}") from e

    await db.commit()
    return {"message": "Role updated", "role": user.role}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: str, current_user: AdminUser, db: DbDep):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from datetime import datetime, timezone
    user.deleted_at = datetime.now(timezone.utc)
    await db.commit()
