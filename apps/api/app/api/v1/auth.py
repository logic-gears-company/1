import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.core.security import (
    create_access_token,
    create_account_revocation_token,
    create_email_verification_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.models.audit import AuditAction, AuditLog
from app.models.user import User
from app.core.config import settings
from app.services.email_service import (
    send_account_alert_email,
    send_password_reset_email,
    send_verification_email,
)

router = APIRouter()


# ─── Schemas ─────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        errors = validate_password_strength(v)
        if errors:
            raise ValueError("; ".join(errors))
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        errors = validate_password_strength(v)
        if errors:
            raise ValueError("; ".join(errors))
        return v


class SendVerificationEmailRequest(BaseModel):
    user_id: str
    email: EmailStr


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _create_audit(
    db, user_id: str, action: AuditAction, request: Request
) -> None:
    log = AuditLog(
        id=str(uuid.uuid4()),
        user_id=user_id,
        action=action,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(log)


def _require_internal_caller(x_internal_secret: str | None) -> None:
    # Constant-time compare: this guards a server-to-server call, not a user
    # session, so a timing side-channel here would leak the shared secret
    # itself rather than just one user's session validity.
    import secrets as _secrets

    if not x_internal_secret or not _secrets.compare_digest(
        x_internal_secret, settings.INTERNAL_API_SECRET
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal service credentials",
        )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, db: DbDep):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        id=str(uuid.uuid4()),
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()

    await _create_audit(db, user.id, AuditAction.REGISTER, request)

    return TokenResponse(
        access_token=create_access_token(user.id, {"email": user.email, "role": user.role}),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: DbDep):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if user.deleted_at:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    await _create_audit(db, user.id, AuditAction.LOGIN, request)

    return TokenResponse(
        access_token=create_access_token(user.id, {"email": user.email, "role": user.role}),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: DbDep):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError("Not a refresh token")
        user_id = payload["sub"]
    except (ValueError, KeyError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid refresh token: {e}",
        ) from e

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.deleted_at:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id, {"email": user.email, "role": user.role}),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: DbDep,
):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Always return the same response so account existence is never disclosed.
    if user and not user.deleted_at and user.password_hash:
        token = create_password_reset_token(user.id)
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        background_tasks.add_task(send_password_reset_email, user.email, reset_url)

    return {"message": "If an account exists for this email, we'll send a reset link."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: DbDep):
    try:
        payload = decode_token(body.token)
        if payload.get("type") != "password_reset":
            raise ValueError("Invalid token type")
        user_id = payload["sub"]
    except (ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.deleted_at or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        )

    user.password_hash = hash_password(body.password)
    await db.flush()
    return {"message": "Your password has been reset successfully."}


@router.post("/send-verification-email", status_code=status.HTTP_202_ACCEPTED)
async def send_verification_email_endpoint(
    body: SendVerificationEmailRequest,
    background_tasks: BackgroundTasks,
    x_internal_secret: str | None = Header(default=None),
):
    # Server-to-server only: the Next.js app calls this right after it
    # creates a pending/unverified user in Postgres via Prisma. No end user
    # ever calls this directly, so it authenticates via shared secret rather
    # than a user Bearer token.
    _require_internal_caller(x_internal_secret)

    token = create_email_verification_token(body.user_id, body.email)
    verify_url = f"{settings.FRONTEND_URL.rstrip('/')}/api/auth/verify-email?token={token}"
    background_tasks.add_task(send_verification_email, body.email, verify_url)

    return {"message": "Verification email queued"}


@router.post("/send-account-alert", status_code=status.HTTP_202_ACCEPTED)
async def send_account_alert_endpoint(
    body: SendVerificationEmailRequest,
    background_tasks: BackgroundTasks,
    x_internal_secret: str | None = Header(default=None),
):
    # Server-to-server only, same shared-secret pattern as
    # send-verification-email. Next.js calls this once an account becomes
    # confirmed — either by clicking the verification link or by first
    # signing in with Google — so the real owner of this address always
    # gets a chance to notice and revoke it if they weren't the one who
    # created it.
    _require_internal_caller(x_internal_secret)

    token = create_account_revocation_token(body.user_id, body.email)
    # Apunta directo a la página de confirmación, no a un endpoint que
    # borre: el link del correo solo navega, el paso destructivo ocurre
    # recién con el POST explícito que dispara el botón de esa página.
    revoke_url = f"{settings.FRONTEND_URL.rstrip('/')}/revoke-account?token={token}"
    background_tasks.add_task(send_account_alert_email, body.email, revoke_url)

    return {"message": "Account alert email queued"}


@router.get("/me")
async def get_me(current_user: CurrentUser):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "image": current_user.image,
        "role": current_user.role,
        "emailVerified": current_user.email_verified,
        "createdAt": current_user.created_at,
    }
