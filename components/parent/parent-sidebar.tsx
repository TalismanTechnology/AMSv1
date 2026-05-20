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
import { motion, LayoutGroup } from "framer-motion";
import { sidebarVariants } from "@/lib/motion";
import { CursorSpotlight } from "@/components/motion/cursor-spotlight";
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
      <div className="flex items-center gap-2.5 px-3 py-3.5 overflow-hidden">
        <Logo size={collapsed ? 18 : 22} className="shrink-0 text-primary" />
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
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
        {!collapsed && (
          <p className="mb-2 px-2 text-[10px] font-mono uppercase tracking-[0.2em] text-sidebar-foreground/75 font-semibold">
            Navigate
          </p>
        )}
        <LayoutGroup id="parent-sidebar">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            const link = (
              <CursorSpotlight radius={180} intensity={0.06} className="block rounded-md">
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group sidebar-item relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium",
                    isActive
                      ? "text-sidebar-foreground"
                      : "text-sidebar-foreground/75 hover:text-sidebar-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="parent-sidebar-active"
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-md bg-[oklch(1_0_0/0.04)] shadow-[inset_2px_0_0_oklch(0.88_0.006_260),inset_0_0_0_1px_oklch(1_0_0/0.06)]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <item.icon
                    strokeWidth={2.25}
                    className="relative h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
                  />
                  {!collapsed && (
                    <span className="relative truncate">{item.label}</span>
                  )}
                </Link>
              </CursorSpotlight>
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
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-sidebar-foreground/55 hover:text-sidebar-foreground"
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
            className="w-full justify-start gap-2.5 text-sidebar-foreground/55 hover:text-sidebar-foreground"
            onClick={() => setJoinDialogOpen(true)}
          >
            <PlusCircle className="h-4 w-4" />
            Join School
          </Button>
        )}
      </div>

      <JoinSchoolDialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen} />

      <div className="px-2 py-1.5">
        <div className="flex items-center justify-center gap-1">
          <NotificationBell />
          <ThemeToggle />
        </div>
      </div>

      <div className="px-2 py-2">
        {!collapsed && userName && (
          <p className="mb-1 px-2 truncate text-[10px] font-mono uppercase tracking-[0.18em] text-sidebar-foreground/75">
            {userName}
          </p>
        )}
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
      className="hidden md:flex h-screen flex-col bg-transparent relative z-20"
    >
      <ParentSidebarContent />
    </motion.aside>
  );
}
