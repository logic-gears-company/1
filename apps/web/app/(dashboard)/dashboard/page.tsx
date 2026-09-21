import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "AXIS Chat" };

export default function DashboardPage() {
  redirect("/chat");
}
