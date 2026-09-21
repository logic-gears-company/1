import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@ai-saas/database";
import { PLANS } from "@/lib/stripe";
import { Check, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { subscription: { include: { plan: true } } },
  });

  if (!user) redirect("/login");

  const currentTier = user.subscription?.plan?.tier ?? "FREE";

  return (
    <div className="p-6 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing information.
        </p>
      </div>

      {/* Current plan */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold">Current Plan</h2>
            <p className="text-sm text-muted-foreground">
              {user.subscription?.status === "TRIALING"
                ? "You are on a free trial"
                : "Your active subscription"}
            </p>
          </div>
          <Badge variant={currentTier === "FREE" ? "secondary" : "default"}>
            {user.subscription?.plan?.name ?? "Free"}
          </Badge>
        </div>
        {user.stripeCustomerId && (
          <form action="/api/billing/portal" method="POST">
            <Button variant="outline" type="submit">
              <ExternalLink className="mr-2 h-4 w-4" />
              Manage billing
            </Button>
          </form>
        )}
      </div>

      {/* Plans */}
      <div>
        <h2 className="font-semibold mb-4">Change Plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-6 flex flex-col ${
                  isCurrent ? "border-primary bg-primary/5" : ""
                } ${plan.popular ? "shadow-md" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{plan.name}</h3>
                  {isCurrent && (
                    <Badge className="text-xs">Current</Badge>
                  )}
                  {plan.popular && !isCurrent && (
                    <Sparkles className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="text-2xl font-bold mb-1">
                  ${(plan.priceMonthly / 100).toFixed(0)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /mo
                  </span>
                </p>
                <ul className="space-y-2 my-4 flex-1 text-sm">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <form action="/api/billing/checkout" method="POST">
                    <input type="hidden" name="priceId" value={plan.priceIdMonthly ?? ""} />
                    <Button
                      type="submit"
                      variant={plan.popular ? "default" : "outline"}
                      className="w-full"
                      disabled={!plan.priceIdMonthly}
                    >
                      {plan.priceMonthly === 0 ? "Downgrade" : "Upgrade"}
                    </Button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
