"use client";
import { useState } from "react";
import { Sun, Moon, Monitor, LogOut, Settings, CreditCard, Menu, Command, Bell, Search } from "lucide-react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent } from "@/components/dashboard/sidebar";
import { getInitials } from "@/lib/utils";
import type { Session } from "next-auth";
import Link from "next/link";

export function DashboardHeader({user,isAdmin}:{user:Session["user"];isAdmin?:boolean}){
 const {setTheme}=useTheme(); const [navOpen,setNavOpen]=useState(false);
 return <header className="h-[68px] border-b border-border/70 flex items-center justify-between px-3 sm:px-5 lg:px-7 bg-background/75 backdrop-blur-2xl flex-shrink-0">
  <div className="flex min-w-0 items-center gap-2"><Sheet open={navOpen} onOpenChange={setNavOpen}><Button variant="ghost" size="icon" className="h-9 w-9 md:hidden rounded-xl" onClick={()=>setNavOpen(true)}><Menu className="h-5 w-5"/></Button><SheetContent side="left" className="w-[280px] p-0"><SheetTitle className="sr-only">AXIS Navigation</SheetTitle><SidebarContent isAdmin={isAdmin} onNavigate={()=>setNavOpen(false)}/></SheetContent></Sheet>
   <button className="hidden sm:flex h-9 items-center gap-2 rounded-xl border bg-card/70 px-3 text-xs text-muted-foreground shadow-sm hover:bg-accent/60 transition-colors"><Search className="h-3.5 w-3.5"/><span>Search AXIS</span><span className="ml-5 flex items-center gap-1 rounded-md border bg-muted/60 px-1.5 py-0.5 text-[9px]"><Command className="h-2.5 w-2.5"/>K</span></button>
   <div className="sm:hidden flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-foreground axis-pulse"/><span className="text-sm font-semibold tracking-[-.02em]">AXIS</span></div>
  </div>
  <div className="flex items-center gap-1"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl"><Sun className="h-4 w-4 rotate-0 scale-100 dark:-rotate-90 dark:scale-0 transition-all"/><Moon className="absolute h-4 w-4 rotate-90 scale-0 dark:rotate-0 dark:scale-100 transition-all"/><span className="sr-only">Theme</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="rounded-2xl"><DropdownMenuItem onClick={()=>setTheme("light")}><Sun className="mr-2 h-4 w-4"/>Light</DropdownMenuItem><DropdownMenuItem onClick={()=>setTheme("dark")}><Moon className="mr-2 h-4 w-4"/>Dark</DropdownMenuItem><DropdownMenuItem onClick={()=>setTheme("system")}><Monitor className="mr-2 h-4 w-4"/>System</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl"><Bell className="h-4 w-4"/></Button>
   <DropdownMenu><DropdownMenuTrigger asChild><button className="ml-1 flex items-center gap-2 rounded-xl px-1.5 py-1.5 hover:bg-accent transition-colors"><Avatar className="h-8 w-8"><AvatarImage src={user?.image??""} alt={user?.name??""}/><AvatarFallback className="text-[11px] bg-foreground text-background">{getInitials(user?.name)}</AvatarFallback></Avatar><div className="hidden lg:block text-left"><p className="text-xs font-medium leading-none">{user?.name}</p><p className="text-[10px] text-muted-foreground leading-none mt-1 max-w-[170px] truncate">{user?.email}</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-60 rounded-2xl p-1.5"><div className="px-3 py-2.5 mb-1"><p className="text-sm font-medium">{user?.name}</p><p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p></div><DropdownMenuItem asChild className="rounded-xl"><Link href="/settings"><Settings className="mr-2 h-4 w-4"/>Settings</Link></DropdownMenuItem><DropdownMenuItem asChild className="rounded-xl"><Link href="/billing"><CreditCard className="mr-2 h-4 w-4"/>Plan</Link></DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="rounded-xl text-destructive focus:text-destructive" onClick={()=>signOut({callbackUrl:"/login"})}><LogOut className="mr-2 h-4 w-4"/>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div>
 </header>;
}
