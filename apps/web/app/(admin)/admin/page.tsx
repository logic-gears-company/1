import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@ai-saas/database";
import { Users, CreditCard, MessageSquare, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin Dashboard" };

export default async function AdminPage() {
  const session = await auth();
  if (!session || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role ?? "")) {
    redirect("/chat");
  }

  const [totalUsers, activeSubscriptions, totalMessages, totalConversations, recentUsers] =
    await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.message.count(),
      prisma.conversation.count(),
      prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
    ]);

  const stats = [
    { label: "Total Users", value: formatNumber(totalUsers), icon: Users, trend: "+12%" },
    { label: "Active Subscriptions", value: formatNumber(activeSubscriptions), icon: CreditCard, trend: "+8%" },
    { label: "Total Messages", value: formatNumber(totalMessages), icon: MessageSquare, trend: "+34%" },
    { label: "Conversations", value: formatNumber(totalConversations), icon: Zap, trend: "+21%" },
  ];

  return (
    <div className="p-6 max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Platform overview and metrics.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-green-500">
              <TrendingUp className="h-3 w-3" />
              {stat.trend} this month
            </div>
          </div>
        ))}
      </div>

      {/* Recent users */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Recent Users</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Role</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {recentUsers.map((user: (typeof recentUsers)[number]) => (
              <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium">{user.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs border bg-background">
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
