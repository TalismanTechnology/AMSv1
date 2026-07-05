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
  ShieldCheck,
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
import { motion, LayoutGroup } from "framer-motion";
import { sidebarVariants } from "@/lib/motion";
import { Logo } from "@/components/logo";
import { DevPanelTrigger } from "@/components/dev-panel/dev-panel-trigger";
import { NotificationBell } from "@/components/parent/notification-bell";
function getNavItems(slug: string) {
  return [
    { href: `/s/${slug}/admin`, label: "Dashboard", icon: LayoutDashboard },
    { href: `/s/${slug}/admin/documents`, label: "Documents", icon: FileText },
    { href: `/s/${slug}/admin/events`, label: "Events", icon: CalendarDays },
    { href: `/s/${slug}/admin/announcements`, label: "Announcements", icon: Megaphone },
    { href: `/s/${slug}/admin/users`, label: "Users", icon: Users },
    { href: `/s/${slug}/admin/analytics`, label: "Analytics", icon: BarChart3 },
    { href: `/s/${slug}/admin/feedback`, label: "Feedback", icon: MessageSquare },
    { href: `/s/${slug}/admin/document-audit`, label: "Doc Audit", icon: ShieldCheck },
    { href: `/s/${slug}/admin/audit`, label: "Audit Log", icon: ScrollText },
    { href: `/s/${slug}/admin/settings`, label: "Settings", icon: Settings },
  ];
}

interface SidebarContentProps {
  onNavigate?: () => void;
  forceExpanded?: boolean;
}

export function AdminSidebarContent({ onNavigate, forceExpanded }: SidebarContentProps) {
  const pathname = usePathname();
  const { collapsed: contextCollapsed } = useSidebar();
  const collapsed = forceExpanded ? false : contextCollapsed;
  const { school, slug, memberships } = useSchool();
  const navItems = getNavItems(slug);
  const adminBase = `/s/${slug}/admin`;

  return (
    <>
      <div className="flex items-center gap-2.5 px-3 py-4 overflow-hidden">
        <DevPanelTrigger collapsed={collapsed} />
        {!collapsed && (
          <span className="font-serif-display truncate text-[15px] font-semibold tracking-[-0.02em] text-sidebar-foreground">
            {school.name}
          </span>
        )}
      </div>

      {memberships.length > 1 && (
        <div className={cn("py-2", collapsed ? "px-2" : "px-3")}>
          <SchoolSwitcher collapsed={collapsed} />
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        <LayoutGroup id="admin-sidebar">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== adminBase && pathname.startsWith(item.href));

            const link = (
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-secondary font-medium text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:bg-secondary hover:text-sidebar-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                <item.icon
                  strokeWidth={2}
                  className="h-[18px] w-[18px] shrink-0"
                />
                {!collapsed && (
                  <span className="truncate">{item.label}</span>
                )}
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
        </LayoutGroup>
      </nav>

      <div className="px-2 py-1.5">
        <div className="flex items-center justify-center gap-1">
          <NotificationBell />
        </div>
      </div>

      <div className="px-2 py-2">
        <form action={logout}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-sidebar-foreground/55 hover:text-sidebar-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2.5 text-sidebar-foreground/55 hover:text-sidebar-foreground"
            >
              <LogOut className="h-4 w-4" />
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
      className="hidden md:flex h-screen flex-col bg-transparent relative z-20"
    >
      <AdminSidebarContent />
    </motion.aside>
  );
}
