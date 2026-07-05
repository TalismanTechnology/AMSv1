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
import { motion, LayoutGroup } from "framer-motion";
import { sidebarVariants } from "@/lib/motion";
import { Logo } from "@/components/logo";
import { JoinSchoolDialog } from "@/components/shared/join-school-dialog";

function getNavItems(slug: string) {
  return [
    { href: `/s/${slug}/parent`, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: `/s/${slug}/parent/chat`, label: "Chat", icon: MessageSquare },
    { href: `/s/${slug}/parent/documents`, label: "Documents", icon: FileText },
    { href: `/s/${slug}/parent/events`, label: "Calendar", icon: CalendarDays },
    { href: `/s/${slug}/parent/announcements`, label: "Announcements", icon: Megaphone },
    { href: `/s/${slug}/parent/profile`, label: "Profile", icon: User },
  ];
}

interface SidebarContentProps {
  onNavigate?: () => void;
  forceExpanded?: boolean;
}

export function ParentSidebarContent({ onNavigate, forceExpanded }: SidebarContentProps) {
  const pathname = usePathname();
  const { collapsed: contextCollapsed, userName } = useParentSidebar();
  const collapsed = forceExpanded ? false : contextCollapsed;
  const { school, slug, memberships } = useSchool();
  const navItems = getNavItems(slug);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2.5 px-4 py-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center">
          <Logo size={collapsed ? 18 : 20} className="text-primary" />
        </span>
        {!collapsed && (
          <span className="min-w-0 truncate text-sm font-semibold tracking-[-0.01em] text-ink">
            {school.name}
          </span>
        )}
      </div>

      {memberships.length > 1 && (
        <div className={cn("py-2", collapsed ? "px-2" : "px-3")}>
          <SchoolSwitcher collapsed={collapsed} />
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-4">
        <LayoutGroup id="parent-sidebar">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            const link = (
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-secondary font-medium text-ink"
                    : "text-ink-soft hover:bg-secondary",
                  collapsed && "justify-center px-2"
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && (
                  <span className="truncate tracking-[-0.01em]">{item.label}</span>
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

      <div className="mx-2.5 mt-2 h-px bg-border" />

      <div className="px-2.5 py-2">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center rounded-lg text-ink-soft hover:bg-secondary hover:text-ink"
                onClick={() => setJoinDialogOpen(true)}
              >
                <PlusCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Join School</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2.5 rounded-lg text-ink-soft hover:bg-secondary hover:text-ink"
            onClick={() => setJoinDialogOpen(true)}
          >
            <PlusCircle className="h-4 w-4" />
            Join School
          </Button>
        )}
      </div>

      <JoinSchoolDialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen} />

      <div className="px-3 pb-3 pt-1">
        <div
          className={cn(
            "flex items-center gap-2 px-1 py-1",
            collapsed && "justify-center"
          )}
        >
          <NotificationBell />
          {!collapsed && (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5">
              {userName ? (
                <span className="truncate text-xs font-medium text-ink-soft">
                  {userName}
                </span>
              ) : (
                <span className="text-xs text-ink-soft">Account</span>
              )}
              <form action={logout} className="shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg text-ink-soft hover:bg-secondary hover:text-ink"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Sign out</TooltipContent>
                </Tooltip>
              </form>
            </div>
          )}
        </div>
        {collapsed && (
          <form action={logout} className="mt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center rounded-lg text-ink-soft hover:bg-secondary hover:text-ink"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          </form>
        )}
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
      className="relative z-20 hidden h-screen flex-col border-r border-border bg-sidebar md:flex"
    >
      <ParentSidebarContent />
    </motion.aside>
  );
}
