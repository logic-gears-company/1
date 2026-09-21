import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserPlus, Crown, Shield, User, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };

const ROLE_ICON = {
  OWNER: Crown,
  ADMIN: Shield,
  MEMBER: User,
  VIEWER: User,
};

const ROLE_COLOR = {
  OWNER: "text-yellow-500",
  ADMIN: "text-blue-500",
  MEMBER: "text-muted-foreground",
  VIEWER: "text-muted-foreground",
};

export default async function TeamPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Demo team members for display
  const members = [
    {
      id: "1",
      name: session.user.name ?? "You",
      email: session.user.email ?? "",
      role: "OWNER" as const,
      image: session.user.image,
      joinedAt: new Date(),
    },
  ];

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground">
            Manage your team members and their roles.
          </p>
        </div>
        <Button>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Member
        </Button>
      </div>

      {/* Members list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Members ({members.length})</h2>
        </div>
        <div className="divide-y">
          {members.map((member) => {
            const RoleIcon = ROLE_ICON[member.role];
            const roleColor = ROLE_COLOR[member.role];
            return (
              <div key={member.id} className="flex items-center gap-4 px-4 py-3">
                <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium flex-shrink-0">
                  {getInitials(member.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${roleColor}`}>
                  <RoleIcon className="h-3.5 w-3.5" />
                  {member.role}
                </div>
                <button className="text-muted-foreground hover:text-foreground p-1">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite section */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-1">Invite by email</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Send an invitation link to a teammate.
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="colleague@company.com"
            className="flex-1 h-10 px-3 rounded-md border bg-background text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <select className="h-10 px-2 rounded-md border bg-background text-sm outline-none focus:ring-1 focus:ring-ring">
            <option>MEMBER</option>
            <option>ADMIN</option>
            <option>VIEWER</option>
          </select>
          <Button>Send invite</Button>
        </div>
      </div>

      {/* Roles explanation */}
      <div className="rounded-xl border bg-muted/30 p-5">
        <h3 className="font-medium mb-3 text-sm">Role permissions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
          {[
            { role: "OWNER", desc: "Full access. Can manage billing and delete the workspace." },
            { role: "ADMIN", desc: "Can manage members, settings, and all resources." },
            { role: "MEMBER", desc: "Can use all AI features and create conversations." },
            { role: "VIEWER", desc: "Read-only access to conversations and outputs." },
          ].map(({ role, desc }) => (
            <div key={role} className="flex gap-2">
              <Badge variant="secondary" className="h-fit text-xs">{role}</Badge>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
