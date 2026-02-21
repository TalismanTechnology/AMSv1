"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useCallback, useEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  Users,
  CalendarDays,
  BarChart3,
  LogOut,
  Megaphone,
  Settings,
  ScrollText,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { logout } from "@/actions/auth";
import { useSidebar } from "./sidebar-context";
import { useSchool } from "@/components/shared/school-context";
import { SchoolSwitcher } from "@/components/shared/school-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { motion } from "framer-motion";
import { sidebarVariants } from "@/lib/motion";
import { Logo } from "@/components/logo";
import { DevPanelTrigger } from "@/components/dev-panel/dev-panel-trigger";
import { NotificationBell } from "@/components/parent/notification-bell";
function getNavItems(slug: string) {
  return [
    { href: `/s/${slug}/admin`, label: "Dashboard", icon: LayoutDashboard },
    { href: `/s/${slug}/admin/documents`, label: "Documents", icon: FileText },
    { href: `/s/${slug}/admin/events`, label: "Calendar", icon: CalendarDays },
    { href: `/s/${slug}/admin/announcements`, label: "Announcements", icon: Megaphone },
    { href: `/s/${slug}/admin/users`, label: "Users", icon: Users },
    { href: `/s/${slug}/admin/analytics`, label: "Analytics", icon: BarChart3 },
    { href: `/s/${slug}/admin/feedback`, label: "Feedback", icon: MessageSquare },
    { href: `/s/${slug}/admin/audit`, label: "Audit Log", icon: ScrollText },
    { href: `/s/${slug}/admin/settings`, label: "Settings", icon: Settings },
  ];
}

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function AdminSidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const { school, slug, memberships } = useSchool();
  const navItems = getNavItems(slug);
  const adminBase = `/s/${slug}/admin`;

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4 py-4  overflow-hidden">
        <DevPanelTrigger collapsed={collapsed} />
        {!collapsed && <span className="text-lg font-bold metallic-text truncate">{school.name}</span>}
      </div>

      {!collapsed && memberships.length > 1 && (
        <div className="border-b px-3 py-2">
          <SchoolSwitcher />
        </div>
      )}

      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== adminBase && pathname.startsWith(item.href));

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
              <item.icon className={cn("h-5 w-5 shrink-0", isActive && "drop-shadow-[0_0_6px_oklch(1_0_0/50%)]")} />
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

      <div className="border-t px-2 py-2 flex justify-center gap-1">
        <NotificationBell />
        <ThemeToggle />
      </div>

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

export function AdminSidebar() {
  const { collapsed, setCollapsed } = useSidebar();
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
      <AdminSidebarContent />
    </motion.aside>
  );
}
