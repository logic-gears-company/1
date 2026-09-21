from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── App ─────────────────────────────────────────────────────────────────
    APP_NAME: str = "AI SaaS API"
    APP_VERSION: str = "1.0.0"
    NODE_ENV: str = "development"
    DEBUG: bool = False

    # ─── Server ───────────────────────────────────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    @property
    def is_production(self) -> bool:
        return self.NODE_ENV == "production"

    # ─── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/ai_saas"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # ─── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"

    # ─── Auth ─────────────────────────────────────────────────────────────────
    API_SECRET_KEY: str = "change-me-in-production-use-32-plus-chars"
    API_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    API_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    API_PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30
    API_EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24
    API_ACCOUNT_REVOCATION_TOKEN_EXPIRE_HOURS: int = 72
    ALGORITHM: str = "HS256"

    # ─── Internal service auth ────────────────────────────────────────────────
    # Shared secret between the Next.js app and this API for server-to-server
    # calls that are not on behalf of any logged-in user (e.g. "send this
    # verification email"). Never exposed to the browser.
    INTERNAL_API_SECRET: str = "change-me-in-production-use-32-plus-chars"

    # ─── AI Providers ─────────────────────────────────────────────────────────
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    DEFAULT_AI_PROVIDER: str = "openai"
    DEFAULT_AI_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536

    # ─── Stripe ───────────────────────────────────────────────────────────────
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None

    # ─── Email (Gmail SMTP) ──────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAIL_FROM: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:3000"

    # ─── S3 Storage ───────────────────────────────────────────────────────────
    S3_BUCKET: Optional[str] = None
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY_ID: Optional[str] = None
    S3_SECRET_ACCESS_KEY: Optional[str] = None
    S3_ENDPOINT: Optional[str] = None

    # ─── Rate limiting ────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 10

    # ─── Observability ────────────────────────────────────────────────────────
    LOG_LEVEL: str = "info"
    SENTRY_DSN: Optional[str] = None
    OTEL_EXPORTER_OTLP_ENDPOINT: Optional[str] = None

    # ─── Features ─────────────────────────────────────────────────────────────
    ENABLE_MULTI_TENANT: bool = True
    ENABLE_AI_AGENTS: bool = True
    ENABLE_KNOWLEDGE_BASE: bool = True
    ENABLE_MARKETPLACE: bool = False

    # ─── File uploads ─────────────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_MIME_TYPES: List[str] = [
        "application/pdf",
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
        "image/jpeg",
        "image/webp",
    ]


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
