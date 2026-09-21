import uuid
from typing import Any

import stripe
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DbDep
from app.core.config import settings
from app.models.billing import Plan, Subscription, SubscriptionStatus, BillingInterval

stripe.api_key = settings.STRIPE_SECRET_KEY

router = APIRouter()


class CheckoutSessionRequest(BaseModel):
    price_id: str
    interval: str = "monthly"
    success_url: str
    cancel_url: str


class PortalSessionRequest(BaseModel):
    return_url: str


# ─── Plans ────────────────────────────────────────────────────────────────────

@router.get("/plans")
async def get_plans(db: DbDep):
    result = await db.execute(
        select(Plan).where(Plan.is_active == True).order_by(Plan.sort_order)
    )
    return {"data": result.scalars().all()}


# ─── Subscription ─────────────────────────────────────────────────────────────

@router.get("/subscription")
async def get_subscription(current_user: CurrentUser, db: DbDep):
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )
    sub = result.scalar_one_or_none()
    return {"data": sub}


@router.get("/invoices")
async def get_invoices(current_user: CurrentUser, db: DbDep):
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )
    sub = result.scalar_one_or_none()
    if not sub or not sub.stripe_subscription_id:
        return {"data": []}

    invoices = stripe.Invoice.list(subscription=sub.stripe_subscription_id, limit=24)
    return {"data": invoices.data}


# ─── Stripe Checkout ──────────────────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout_session(
    body: CheckoutSessionRequest, current_user: CurrentUser, db: DbDep
):
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Billing not configured")

    # Get or create Stripe customer
    customer_id = current_user.stripe_customer_id
    if not customer_id:
        customer = stripe.Customer.create(
            email=current_user.email,
            name=current_user.name,
            metadata={"user_id": current_user.id},
        )
        customer_id = customer.id
        current_user.stripe_customer_id = customer_id
        await db.commit()

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": body.price_id, "quantity": 1}],
        mode="subscription",
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        subscription_data={
            "trial_period_days": 14,
            "metadata": {"user_id": current_user.id},
        },
        allow_promotion_codes=True,
    )

    return {"url": session.url}


@router.post("/portal")
async def create_portal_session(
    body: PortalSessionRequest, current_user: CurrentUser
):
    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")

    session = stripe.billing_portal.Session.create(
        customer=current_user.stripe_customer_id,
        return_url=body.return_url,
    )
    return {"url": session.url}


# ─── Stripe Webhook ───────────────────────────────────────────────────────────

@router.post("/webhook")
async def stripe_webhook(request: Request, db: DbDep):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.SignatureVerificationError as e:
        raise HTTPException(status_code=400, detail=f"Webhook signature invalid: {e}") from e

    event_type = event["type"]
    data: Any = event["data"]["object"]

    if event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        await _handle_subscription_event(data, db)

    elif event_type == "invoice.payment_succeeded":
        await _handle_invoice_paid(data, db)

    return {"received": True}


async def _handle_subscription_event(subscription_data: dict, db) -> None:
    stripe_sub_id = subscription_data["id"]
    status_str = subscription_data["status"].upper()
    customer_id = subscription_data["customer"]

    from app.models.user import User
    result = await db.execute(select(User).where(User.stripe_customer_id == customer_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user.id)
    )
    sub = result.scalar_one_or_none()

    try:
        sub_status = SubscriptionStatus[status_str]
    except KeyError:
        sub_status = SubscriptionStatus.ACTIVE

    if sub:
        sub.status = sub_status
        sub.stripe_cancel_at_period_end = subscription_data.get("cancel_at_period_end", False)
    else:
        # Find plan by price ID
        price_id = subscription_data["items"]["data"][0]["price"]["id"]
        result = await db.execute(
            select(Plan).where(
                (Plan.stripe_price_id_monthly == price_id)
                | (Plan.stripe_price_id_yearly == price_id)
            )
        )
        plan = result.scalar_one_or_none()

        new_sub = Subscription(
            id=str(uuid.uuid4()),
            user_id=user.id,
            plan_id=plan.id if plan else "free",
            status=sub_status,
            billing_interval=BillingInterval.MONTHLY,
            stripe_subscription_id=stripe_sub_id,
            stripe_price_id=price_id,
        )
        db.add(new_sub)

    await db.commit()


async def _handle_invoice_paid(invoice_data: dict, db) -> None:
    # Store invoice record
    pass
