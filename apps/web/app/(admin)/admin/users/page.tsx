import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma, UserRole } from "@ai-saas/database";
import { Search, MoreHorizontal, UserCheck, UserX, Shield, Crown, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getInitials, formatNumber } from "@/lib/utils";
import type { Metadata } from "next";

const VALID_ROLES = new Set<string>(Object.values(UserRole));

function parseRoleFilter(role: string | undefined): UserRole | undefined {
  return role && VALID_ROLES.has(role) ? (role as UserRole) : undefined;
}

export const metadata: Metadata = { title: "Admin — Users" };

const ROLE_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  SUPER_ADMIN: "default",
  ADMIN: "default",
  USER: "secondary",
};

const ROLE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  SUPER_ADMIN: Crown,
  ADMIN: Shield,
  USER: User,
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; role?: string }>;
}) {
  const session = await auth();
  if (!session || !["ADMIN", "SUPER_ADMIN"].includes(session.user?.role ?? "")) {
    redirect("/chat");
  }

  const params = await searchParams;
  const search = params.search ?? "";
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 10;
  const roleFilter = params.role;
  const validatedRole = parseRoleFilter(roleFilter);

  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(validatedRole ? { role: validatedRole } : {}),
  };

  const [users, total, stats] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { conversations: true, messages: true } },
      },
    }),
    prisma.user.count({ where }),
    Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, role: "ADMIN" } }),
      prisma.user.count({
        where: {
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
        },
      }),
    ]),
  ]);

  const [totalUsers, adminCount, newThisWeek] = stats;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground">Manage all registered users on the platform.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
            Total Users
          </p>
          <p className="text-3xl font-bold">{formatNumber(totalUsers)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
            Admins
          </p>
          <p className="text-3xl font-bold">{adminCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
            New This Week
          </p>
          <p className="text-3xl font-bold text-green-500">+{newThisWeek}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <form>
              <input
                name="search"
                defaultValue={search}
                placeholder="Search by name or email…"
                className="pl-8 pr-3 py-2 text-sm rounded-md border bg-background outline-none focus:ring-1 focus:ring-ring w-full"
              />
            </form>
          </div>

          <div className="flex items-center gap-2">
            {["", "USER", "ADMIN", "SUPER_ADMIN"].map((role) => (
              <a
                key={role}
                href={`/admin/users?role=${role}&search=${search}`}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  roleFilter === role || (!roleFilter && role === "")
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {role || "All"}
              </a>
            ))}
          </div>

          <span className="text-xs text-muted-foreground ml-auto">
            {total} user{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                  User
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Plan
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Conversations
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Messages
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Tokens
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">
                  Joined
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user: (typeof users)[number]) => {
                  const RoleIcon = ROLE_ICON[user.role] ?? User;
                  return (
                    <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <p className="font-medium leading-none">{user.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <RoleIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <Badge
                            variant={ROLE_BADGE[user.role] ?? "secondary"}
                            className="text-xs"
                          >
                            {user.role}
                          </Badge>
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-background">
                          {user.subscription?.plan?.name ?? "Free"}
                        </span>
                      </td>

                      {/* Conversations */}
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {user._count.conversations}
                      </td>

                      {/* Messages */}
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {user._count.messages}
                      </td>

                      {/* Tokens */}
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        {formatNumber(user.tokensUsed)}
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            title="Verify email"
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-green-500"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Suspend user"
                            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </button>
                          <button className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total} users
            </p>
            <div className="flex gap-1">
              {page > 1 && (
                <a
                  href={`/admin/users?page=${page - 1}&search=${search}`}
                  className="px-3 py-1.5 rounded border text-xs hover:bg-muted transition-colors"
                >
                  Previous
                </a>
              )}
              {page < totalPages && (
                <a
                  href={`/admin/users?page=${page + 1}&search=${search}`}
                  className="px-3 py-1.5 rounded border text-xs hover:bg-muted transition-colors"
                >
                  Next
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
