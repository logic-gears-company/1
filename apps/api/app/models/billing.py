from datetime import datetime
from decimal import Decimal
import enum
from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey, Integer,
    JSON, Numeric, String, BigInteger, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PlanTier(str, enum.Enum):
    FREE = "FREE"
    PRO = "PRO"
    ENTERPRISE = "ENTERPRISE"


class BillingInterval(str, enum.Enum):
    MONTHLY = "MONTHLY"
    YEARLY = "YEARLY"


class SubscriptionStatus(str, enum.Enum):
    TRIALING = "TRIALING"
    ACTIVE = "ACTIVE"
    CANCELED = "CANCELED"
    INCOMPLETE = "INCOMPLETE"
    INCOMPLETE_EXPIRED = "INCOMPLETE_EXPIRED"
    PAST_DUE = "PAST_DUE"
    UNPAID = "UNPAID"
    PAUSED = "PAUSED"


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    tier: Mapped[PlanTier] = mapped_column(Enum(PlanTier), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    features: Mapped[list] = mapped_column(JSON, default=list)

    max_tokens_per_month: Mapped[int] = mapped_column(Integer, nullable=False)
    max_messages: Mapped[int] = mapped_column(Integer, nullable=False)
    max_storage: Mapped[int] = mapped_column(BigInteger, nullable=False)
    max_team_members: Mapped[int] = mapped_column(Integer, default=1)
    max_api_keys: Mapped[int] = mapped_column(Integer, default=3)
    max_conversations: Mapped[int] = mapped_column(Integer, nullable=False)
    custom_models: Mapped[bool] = mapped_column(Boolean, default=False)
    priority_support: Mapped[bool] = mapped_column(Boolean, default=False)

    stripe_price_id_monthly: Mapped[str | None] = mapped_column(String(255))
    stripe_price_id_yearly: Mapped[str | None] = mapped_column(String(255))
    price_monthly: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    price_yearly: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="plan")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    plan_id: Mapped[str] = mapped_column(String, ForeignKey("plans.id"), nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(Enum(SubscriptionStatus), nullable=False)
    billing_interval: Mapped[BillingInterval] = mapped_column(
        Enum(BillingInterval), nullable=False
    )

    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    stripe_price_id: Mapped[str | None] = mapped_column(String(255))
    stripe_current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stripe_current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stripe_cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_trial_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User | None"] = relationship(back_populates="subscription")
    plan: Mapped["Plan"] = relationship(back_populates="subscriptions")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="subscription")


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    subscription_id: Mapped[str] = mapped_column(
        String, ForeignKey("subscriptions.id"), nullable=False
    )
    stripe_invoice_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="usd")
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    hosted_invoice_url: Mapped[str | None] = mapped_column(String(1024))
    invoice_pdf: Mapped[str | None] = mapped_column(String(1024))
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subscription: Mapped["Subscription"] = relationship(back_populates="invoices")
