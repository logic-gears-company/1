import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── Password hashing ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_strength(password: str) -> list[str]:
    errors = []
    if len(password) < 8:
        errors.append("Password must be at least 8 characters")
    if not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter")
    if not any(c.islower() for c in password):
        errors.append("Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one digit")
    return errors


# ─── JWT tokens ───────────────────────────────────────────────────────────────

def create_access_token(
    subject: str | Any,
    extra_claims: dict | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.API_ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    if extra_claims:
        # The token class is invariant: callers must not be able to turn an
        # access token into a reset/refresh token through arbitrary claims.
        payload.update({key: value for key, value in extra_claims.items() if key != "type"})
    return jwt.encode(payload, settings.API_SECRET_KEY, algorithm=settings.ALGORITHM)


def create_password_reset_token(subject: str | Any) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.API_PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "password_reset",
    }
    return jwt.encode(payload, settings.API_SECRET_KEY, algorithm=settings.ALGORITHM)


def create_email_verification_token(subject: str | Any, email: str) -> str:
    # `email` travels inside the token and is re-checked against the live row
    # when the token is consumed: if the address changes before verification,
    # a stale token must not be able to verify the new address instead.
    expire = datetime.now(timezone.utc) + timedelta(
        hours=settings.API_EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS
    )
    payload = {
        "sub": str(subject),
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "email_verification",
    }
    return jwt.encode(payload, settings.API_SECRET_KEY, algorithm=settings.ALGORITHM)


def create_account_revocation_token(subject: str | Any, email: str) -> str:
    # Vive más que el de verificación (72h vs 24h): la persona que recibe
    # este correo no pidió nada, así que puede tardar más en notarlo y
    # actuar — no conviene que el link ya haya vencido cuando por fin
    # revisa la bandeja.
    expire = datetime.now(timezone.utc) + timedelta(
        hours=settings.API_ACCOUNT_REVOCATION_TOKEN_EXPIRE_HOURS
    )
    payload = {
        "sub": str(subject),
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "account_revocation",
    }
    return jwt.encode(payload, settings.API_SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str | Any) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.API_REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": str(subject),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.API_SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.API_SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}") from e


# ─── API Keys ─────────────────────────────────────────────────────────────────

def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key, key_prefix, key_hash)"""
    raw = f"sk-{secrets.token_urlsafe(32)}"
    prefix = raw[:12]
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, prefix, key_hash


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


# ─── CSRF ─────────────────────────────────────────────────────────────────────

def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def verify_csrf_token(token: str, stored: str) -> bool:
    return secrets.compare_digest(token, stored)
