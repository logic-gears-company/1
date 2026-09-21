import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@ai-saas/database";
import { TrendingUp, MessageSquare, Users, Zap, CreditCard, Activity } from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Analytics" };

async function getGrowthData() {
  const now = new Date();
  const periods = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(now);
    start.setDate(start.getDate() - (6 - i));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start, end, label: start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) };
  });

  const dailyData = await Promise.all(
    periods.map(async ({ start, end, label }) => {
      const [users, messages, conversations] = await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: start, lte: end } } }),
        prisma.message.count({ where: { createdAt: { gte: start, lte: end } } }),
        prisma.conversation.count({ where: { createdAt: { gte: start, lte: end } } }),
      ]);
      return { label, users, messages, conversations };
    })
  );

  return dailyData;
}

async function getProviderBreakdown() {
  const providers = await prisma.message.groupBy({
    by: ["provider"],
    _count: { id: true },
    where: { provider: { not: null } },
    orderBy: { _count: { id: "desc" } },
  });
  const total = providers.reduce((s: number, p: (typeof providers)[number]) => s + p._count.id, 0);
  return providers.map((p: (typeof providers)[number]) => ({
    provider: p.provider ?? "unknown",
    count: p._count.id,
    pct: total > 0 ? Math.round((p._count.id / total) * 100) : 0,
  }));
}

async function getPlanBreakdown() {
  const plans = await prisma.subscription.groupBy({
    by: ["planId"],
    _count: { id: true },
    where: { status: "ACTIVE" },
  });
  const planDetails = await prisma.plan.findMany({
    where: { id: { in: plans.map((p: (typeof plans)[number]) => p.planId) } },
  });
  const total = plans.reduce((s: number, p: (typeof plans)[number]) => s + p._count.id, 0);

  return plans.map((p: (typeof plans)[number]) => {
    const plan = planDetails.find((d: (typeof planDetails)[number]) => d.id === p.planId);
    return {
      name: plan?.name ?? "Unknown",
      tier: plan?.tier ?? "FREE",
      count: p._count.id,
      pct: total > 0 ? Math.round((p._count.id / total) * 100) : 0,
    };
  });
}

const PROVIDER_COLOR: Record<string, string> = {
  openai: "bg-green-500",
  anthropic: "bg-orange-500",
  ollama: "bg-blue-500",
  unknown: "bg-muted-foreground",
};

const TIER_COLOR: Record<string, string> = {
  FREE: "bg-gray-400",
  PRO: "bg-primary",
  ENTERPRISE: "bg-yellow-500",
};

export default async function AdminAnalyticsPage() {
  const session = await auth();
  if (!session || !["ADMIN", "SUPER_ADMIN"].includes(session.user?.role ?? "")) {
    redirect("/chat");
  }

  const [dailyData, providerBreakdown, planBreakdown, totals] = await Promise.all([
    getGrowthData(),
    getProviderBreakdown(),
    getPlanBreakdown(),
    Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.message.count(),
      prisma.conversation.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.user.aggregate({ _sum: { tokensUsed: true } }),
    ]),
  ]);

  const [totalUsers, totalMessages, totalConversations, activeSubs, tokenAgg] = totals;
  const totalTokens = tokenAgg._sum.tokensUsed ?? 0;

  const maxMessages = Math.max(...dailyData.map((d: (typeof dailyData)[number]) => d.messages), 1);
  const maxUsers = Math.max(...dailyData.map((d: (typeof dailyData)[number]) => d.users), 1);

  return (
    <div className="p-6 max-w-7xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Platform usage metrics and growth trends.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: formatNumber(totalUsers), icon: Users, color: "text-blue-500" },
          { label: "Total Messages", value: formatNumber(totalMessages), icon: MessageSquare, color: "text-green-500" },
          { label: "Conversations", value: formatNumber(totalConversations), icon: Activity, color: "text-purple-500" },
          { label: "Active Subs", value: formatNumber(activeSubs), icon: CreditCard, color: "text-orange-500" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground font-medium">{kpi.label}</p>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </div>
            <p className="text-3xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Token usage highlight */}
      <div className="rounded-xl border bg-gradient-to-r from-primary/10 via-primary/5 to-background p-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-5 w-5 text-primary" />
            <span className="font-semibold">Total Tokens Consumed</span>
          </div>
          <p className="text-4xl font-bold">{formatNumber(totalTokens)}</p>
          <p className="text-sm text-muted-foreground mt-1">across all users and conversations</p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-sm text-muted-foreground">Est. API cost</p>
          <p className="text-2xl font-bold">
            {formatCurrency(Math.round(totalTokens * 0.00015), "USD")}
          </p>
          <p className="text-xs text-muted-foreground">at GPT-4o mini pricing</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily messages chart */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-1">Daily Messages (7 days)</h2>
          <p className="text-xs text-muted-foreground mb-5">Messages sent per day across all users</p>
          <div className="flex items-end gap-2 h-40">
            {dailyData.map((day: (typeof dailyData)[number]) => (
              <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-muted-foreground">{day.messages}</span>
                <div
                  className="w-full rounded-t-sm bg-primary transition-all"
                  style={{ height: `${Math.max(4, (day.messages / maxMessages) * 120)}px` }}
                />
                <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                  {day.label.split(",")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily signups chart */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-1">Daily Signups (7 days)</h2>
          <p className="text-xs text-muted-foreground mb-5">New user registrations per day</p>
          <div className="flex items-end gap-2 h-40">
            {dailyData.map((day: (typeof dailyData)[number]) => (
              <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-muted-foreground">{day.users}</span>
                <div
                  className="w-full rounded-t-sm bg-green-500 transition-all"
                  style={{ height: `${Math.max(4, (day.users / maxUsers) * 120)}px` }}
                />
                <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                  {day.label.split(",")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: Provider + Plan breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Provider breakdown */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-1">AI Provider Usage</h2>
          <p className="text-xs text-muted-foreground mb-5">
            Share of messages by provider
          </p>
          {providerBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages sent yet
            </p>
          ) : (
            <div className="space-y-4">
              {providerBreakdown.map((p: (typeof providerBreakdown)[number]) => (
                <div key={p.provider}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${PROVIDER_COLOR[p.provider] ?? "bg-muted-foreground"}`}
                      />
                      <span className="font-medium capitalize">{p.provider}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-xs">
                        {formatNumber(p.count)} msgs
                      </span>
                      <span className="font-semibold w-9 text-right">{p.pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${PROVIDER_COLOR[p.provider] ?? "bg-muted-foreground"}`}
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plan breakdown */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-1">Subscription Plans</h2>
          <p className="text-xs text-muted-foreground mb-5">
            Active subscriptions by plan tier
          </p>
          {planBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No active subscriptions
            </p>
          ) : (
            <div className="space-y-4">
              {planBreakdown.map((p: (typeof planBreakdown)[number]) => (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${TIER_COLOR[p.tier] ?? "bg-muted-foreground"}`}
                      />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">({p.tier})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-xs">{p.count} users</span>
                      <span className="font-semibold w-9 text-right">{p.pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${TIER_COLOR[p.tier] ?? "bg-muted-foreground"}`}
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top conversations */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Most Active Conversations</h2>
        </div>
        <TopConversations />
      </div>
    </div>
  );
}

async function TopConversations() {
  const conversations = await prisma.conversation.findMany({
    orderBy: { totalTokens: "desc" },
    take: 5,
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { messages: true } },
    },
  });

  if (conversations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No conversations yet
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/30 border-b">
        <tr>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Title</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">User</th>
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Model</th>
          <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Messages</th>
          <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Tokens</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {conversations.map((conv: (typeof conversations)[number]) => (
          <tr key={conv.id} className="hover:bg-muted/20 transition-colors">
            <td className="px-4 py-3 max-w-[200px]">
              <p className="truncate font-medium">{conv.title}</p>
            </td>
            <td className="px-4 py-3 text-muted-foreground text-xs">
              {conv.user.name ?? conv.user.email}
            </td>
            <td className="px-4 py-3">
              <span className="px-2 py-0.5 rounded text-xs bg-muted font-mono">{conv.model}</span>
            </td>
            <td className="px-4 py-3 text-right font-mono text-xs">{conv._count.messages}</td>
            <td className="px-4 py-3 text-right font-mono text-xs">{formatNumber(conv.totalTokens)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
