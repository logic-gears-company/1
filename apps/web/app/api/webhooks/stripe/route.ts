import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@ai-saas/database";
import type Stripe from "stripe";

// Un webhook depende del body y la firma de cada request individual: nunca
// puede evaluarse estáticamente. Sin esto, Next puede intentar analizar la
// ruta durante "Collecting page data" en build-time.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook error: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(
        event.data.object as Stripe.Subscription
      );
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription
      );
      break;

    case "invoice.payment_succeeded":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handleInvoiceFailed(event.data.object as Stripe.Invoice);
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });
  if (!user) return;

  const priceId = sub.items.data[0]?.price.id;
  const plan = priceId
    ? await prisma.plan.findFirst({
        where: {
          OR: [
            { stripePriceIdMonthly: priceId },
            { stripePriceIdYearly: priceId },
          ],
        },
      })
    : null;

  const statusMap: Record<string, string> = {
    active: "ACTIVE",
    trialing: "TRIALING",
    canceled: "CANCELED",
    incomplete: "INCOMPLETE",
    incomplete_expired: "INCOMPLETE_EXPIRED",
    past_due: "PAST_DUE",
    unpaid: "UNPAID",
    paused: "PAUSED",
  };

  await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      planId: plan?.id ?? "free",
      status: (statusMap[sub.status] ?? "ACTIVE") as any,
      billingInterval: "MONTHLY",
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      stripeCurrentPeriodStart: new Date(sub.current_period_start * 1000),
      stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
      stripeCancelAtPeriodEnd: sub.cancel_at_period_end,
    },
    update: {
      planId: plan?.id ?? "free",
      status: (statusMap[sub.status] ?? "ACTIVE") as any,
      stripePriceId: priceId,
      stripeCurrentPeriodStart: new Date(sub.current_period_start * 1000),
      stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
      stripeCancelAtPeriodEnd: sub.cancel_at_period_end,
    },
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: sub.id },
    data: { status: "CANCELED", canceledAt: new Date() },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Store invoice for record-keeping
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  // Notify user of payment failure
}
