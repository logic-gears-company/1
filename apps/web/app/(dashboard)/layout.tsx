import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { TimezoneSync } from "@/components/profile/timezone-sync";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(session.user?.role ?? "");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <TimezoneSync />
      <Sidebar isAdmin={isAdmin} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <DashboardHeader user={session.user} isAdmin={isAdmin} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
