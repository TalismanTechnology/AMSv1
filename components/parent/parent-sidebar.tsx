"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  CalendarDays,
  Megaphone,
  User,
  LogOut,
  PlusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { logout } from "@/actions/auth";
import { useParentSidebar } from "./sidebar-context";
import { useSchool } from "@/components/shared/school-context";
import { SchoolSwitcher } from "@/components/shared/school-switcher";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { motion } from "framer-motion";
import { sidebarVariants } from "@/lib/motion";
import { Logo } from "@/components/logo";
import { JoinSchoolDialog } from "@/components/shared/join-school-dialog";

function getNavItems(slug: string) {
  return [
    { href: `/s/${slug}/parent`, label: "Dashboard", icon: LayoutDashboard, exact: true, neon: "neon-icon-blue" },
    { href: `/s/${slug}/parent/chat`, label: "Chat", icon: MessageSquare, neon: "neon-icon-blue" },
    { href: `/s/${slug}/parent/documents`, label: "Documents", icon: FileText, neon: "neon-icon-cyan" },
    { href: `/s/${slug}/parent/events`, label: "Calendar", icon: CalendarDays, neon: "neon-icon-green" },
    { href: `/s/${slug}/parent/announcements`, label: "Announcements", icon: Megaphone, neon: "neon-icon-amber" },
    { href: `/s/${slug}/parent/profile`, label: "Profile", icon: User, neon: "neon-icon-purple" },
  ];
}

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function ParentSidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  const { collapsed, userName } = useParentSidebar();
  const { school, slug, memberships } = useSchool();
  const navItems = getNavItems(slug);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4 py-4  overflow-hidden">
        <Logo size={collapsed ? 16 : 28} className="shrink-0 text-primary drop-shadow-[0_0_8px_var(--glow-primary)] drop-shadow-[0_0_12px_oklch(1_0_0/40%)]" />
        {!collapsed && (
          <span className="text-lg font-bold metallic-text truncate">{school.name}</span>
        )}
      </div>

      {!collapsed && memberships.length > 1 && (
        <div className="border-b px-3 py-2">
          <SchoolSwitcher />
        </div>
      )}

      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);

          const link = (
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-primary shadow-[inset_3px_0_8px_-2px_oklch(1_0_0/30%),inset_0_1px_0_oklch(1_0_0/8%)]"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  isActive && item.neon
                )}
              />
              {!collapsed && item.label}
            </Link>
          );

          return collapsed ? (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : (
            <div key={item.href}>{link}</div>
          );
        })}
      </nav>

      {/* Join another school */}
      <div className="border-t px-2 py-2">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-center text-sidebar-foreground/60"
                onClick={() => setJoinDialogOpen(true)}
              >
                <PlusCircle className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Join School</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground/60"
            onClick={() => setJoinDialogOpen(true)}
          >
            <PlusCircle className="h-5 w-5" />
            Join School
          </Button>
        )}
      </div>

      <JoinSchoolDialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen} />

      {/* User name */}
      {!collapsed && userName && (
        <div className="border-t px-4 py-2 ">
          <p className="truncate text-xs text-sidebar-foreground/50">
            {userName}
          </p>
        </div>
      )}

      {/* Notifications + Theme */}
      <div className="border-t px-2 py-2  flex items-center justify-center gap-2">
        <NotificationBell />
        <ThemeToggle />
      </div>

      {/* Sign out */}
      <div className="border-t px-2 py-4 ">
        <form action={logout}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-center text-sidebar-foreground/60"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start gap-3 text-sidebar-foreground/60"
            >
              <LogOut className="h-5 w-5" />
              Sign out
            </Button>
          )}
        </form>
      </div>
    </>
  );
}

export function ParentSidebar() {
  const { collapsed, setCollapsed } = useParentSidebar();
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setCollapsed(false);
  }, [setCollapsed]);

  const handleMouseLeave = useCallback(() => {
    collapseTimerRef.current = setTimeout(() => {
      setCollapsed(true);
    }, 250);
  }, [setCollapsed]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, []);

  return (
    <motion.aside
      animate={collapsed ? "collapsed" : "expanded"}
      variants={sidebarVariants}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="hidden md:flex h-screen flex-col border-r border-sidebar-border bg-sidebar metallic-surface noise-overlay neon-border"
    >
      <ParentSidebarContent />
    </motion.aside>
  );
}
