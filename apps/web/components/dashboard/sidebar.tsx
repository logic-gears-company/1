"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { MessageSquare, Settings, CreditCard, Key, Users, Bot, FileText, BarChart2, LogOut, ChevronRight, Zap, PenLine, Orbit, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const NAV_SECTIONS = [
  { label: null, items: [
    { href: "/chat", label: "AXIS", icon: MessageSquare },
  ]},
  { label: "Workspace", items: [
    { href: "/agents", label: "Agents", icon: Bot },
    { href: "/content", label: "Create", icon: PenLine },
    { href: "/automation", label: "Automation", icon: Zap },
    { href: "/playground", label: "Playground", icon: Sparkles },
    { href: "/files", label: "Memory", icon: FileText },
  ]},
  { label: "Account", items: [
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/billing", label: "Plan", icon: CreditCard },
    { href: "/api-keys", label: "API", icon: Key },
    { href: "/team", label: "Team", icon: Users },
  ]},
];
const ADMIN_ITEMS = [
  { href: "/admin", label: "Admin", icon: BarChart2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart2 },
];
interface SidebarProps { isAdmin?: boolean; }

function NavItem({ href, label, icon: Icon, onNavigate }: { href:string; label:string; icon:React.ComponentType<{className?:string}>; onNavigate?:()=>void }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href);
  return <Link href={href} onClick={onNavigate} className={cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-300", active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" : "text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground")}>
    <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors", active ? "bg-background/75" : "group-hover:bg-background/40")}><Icon className="h-[15px] w-[15px]" /></span>
    <span className="flex-1">{label}</span><ChevronRight className={cn("h-3 w-3 opacity-0 transition-all", active && "opacity-35 translate-x-0.5")} />
  </Link>;
}

function Brand() {
  return <Link href="/chat" className="flex items-center gap-3 px-2 py-3 group">
    <span className="relative flex h-9 w-9 items-center justify-center rounded-[12px] bg-foreground text-background shadow-sm"><Orbit className="h-[18px] w-[18px] transition-transform duration-500 group-hover:rotate-90"/><span className="absolute h-1.5 w-1.5 rounded-full bg-background"/></span>
    <span className="min-w-0"><span className="block truncate text-sm font-semibold tracking-[-.02em]">AXIS</span><span className="block truncate text-[9px] uppercase tracking-[.24em] text-sidebar-foreground/30">Logic Gears</span></span>
  </Link>;
}

function SidebarContent({ isAdmin, onNavigate }: SidebarProps & { onNavigate?:()=>void }) {
  return <>
    <div className="px-3 pt-3 pb-3"><Brand /></div>
    <div className="mx-3 mb-3 rounded-[1.15rem] border border-sidebar-border/80 bg-sidebar-accent/35 p-3">
      <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-foreground/80 axis-pulse"/><span className="text-[11px] font-medium">AXIS is ready</span></div>
      <p className="mt-1.5 text-[10px] leading-4 text-sidebar-foreground/38">A stable place to think, create and move forward.</p>
    </div>
    <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-5">
      {NAV_SECTIONS.map((section,i)=><div key={i} className="space-y-1">{section.label && <p className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-[.22em] text-sidebar-foreground/28">{section.label}</p>}{section.items.map(item=><NavItem key={item.href} {...item} onNavigate={onNavigate}/>)}</div>)}
      {isAdmin && <div className="space-y-1"><Separator className="bg-sidebar-border mb-3"/><p className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-[.22em] text-sidebar-foreground/28">System</p>{ADMIN_ITEMS.map(item=><NavItem key={item.href} {...item} onNavigate={onNavigate}/>)}</div>}
    </nav>
    <div className="p-2.5 border-t border-sidebar-border/80"><Button variant="ghost" className="h-10 w-full justify-start gap-3 rounded-xl text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={()=>signOut({callbackUrl:"/login"})}><span className="flex h-7 w-7 items-center justify-center rounded-lg"><LogOut className="h-4 w-4"/></span>Sign out</Button></div>
  </>;
}
export function Sidebar({isAdmin}:SidebarProps){return <aside className="hidden md:flex h-full w-[248px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border/80 flex-shrink-0"><SidebarContent isAdmin={isAdmin}/></aside>;}
export { SidebarContent };
