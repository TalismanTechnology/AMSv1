"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef, useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Users,
  CalendarDays,
  Mail,
  Contact,
  BarChart3,
  LogOut,
  Settings,
  ScrollText,
  MessageSquare,
  ShieldCheck,
  GitCompareArrows,
  ChevronRight,
  Search,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { logout } from "@/actions/auth";
import { useSidebar } from "./sidebar-context";
import { useCommandPalette, useShortcutLabel } from "./command-palette";
import { useSchool } from "@/components/shared/school-context";
import { SchoolSwitcher } from "@/components/shared/school-switcher";
import { motion, LayoutGroup } from "framer-motion";
import { sidebarVariants } from "@/lib/motion";
import { SuperAdminLogo } from "@/components/admin/super-admin-logo";
import { InstallAppButton } from "@/components/shared/install-app-button";
import {
  ADMIN_NAV,
  activeNavChild,
  adminRelativePath,
  isNavItemActive,
  type AdminNavItem,
} from "@/lib/admin/nav";

const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  documents: FileText,
  events: CalendarDays,
  "email-intake": Mail,
  contacts: Contact,
  feedback: MessageSquare,
  analytics: BarChart3,
  users: Users,
  conflicts: GitCompareArrows,
  "document-audit": ShieldCheck,
  audit: ScrollText,
  settings: Settings,
};

interface SidebarContentProps {
  onNavigate?: () => void;
  forceExpanded?: boolean;
}

export function AdminSidebarContent({ onNavigate, forceExpanded }: SidebarContentProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { collapsed: contextCollapsed, badges } = useSidebar();
  const collapsed = forceExpanded ? false : contextCollapsed;
  const { school, slug, memberships } = useSchool();
  const adminBase = `/s/${slug}/admin`;
  const relPath = adminRelativePath(pathname, adminBase);

  return (
    <>
      <div className="flex items-center gap-2.5 px-3 py-4 overflow-hidden">
        <SuperAdminLogo collapsed={collapsed} />
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

      <div className="px-2 pt-1">
        <SidebarSearch collapsed={collapsed} onOpen={onNavigate} />
      </div>

      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-2 py-3">
        <LayoutGroup id="admin-sidebar">
          {ADMIN_NAV.map((group) => (
            <div key={group.key} className={cn(group.label && "mt-4 first:mt-0")}>
              {group.label && !collapsed && (
                <p className="px-2.5 pb-1 text-[0.7rem] font-medium uppercase tracking-wide text-sidebar-foreground/45">
                  {group.label}
                </p>
              )}
              {group.label && collapsed && (
                <div aria-hidden className="mx-2.5 mb-2 border-t border-sidebar-foreground/10" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <NavItem
                      item={item}
                      adminBase={adminBase}
                      relPath={relPath}
                      searchParams={searchParams}
                      collapsed={collapsed}
                      badge={item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </LayoutGroup>
      </nav>

      <div className="px-2 py-2">
        <InstallAppButton
          collapsed={collapsed}
          tipSide={collapsed ? "right" : "top"}
          className="mb-0.5 w-full text-sidebar-foreground/55 hover:text-sidebar-foreground"
        />
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

/** The search box that opens the command palette (an icon in the rail). */
function SidebarSearch({ collapsed, onOpen }: { collapsed: boolean; onOpen?: () => void }) {
  const { open } = useCommandPalette();
  const shortcut = useShortcutLabel();
  function handleClick() {
    // In the phone drawer, close it first so the palette isn't behind it.
    onOpen?.();
    open();
  }

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            aria-label="Search pages and settings"
            className="flex w-full items-center justify-center rounded-lg px-2 py-2 text-sidebar-foreground/70 transition-colors hover:bg-secondary hover:text-sidebar-foreground"
          >
            <Search strokeWidth={2} className="h-[18px] w-[18px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Search ({shortcut})</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Search pages and settings"
      aria-keyshortcuts="Meta+K Control+K"
      className="flex h-9 w-full items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-ink focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate text-left">Search…</span>
      <kbd className="rounded border border-border px-1.5 py-0.5 font-sans text-[0.7rem] leading-none">
        {shortcut}
      </kbd>
    </button>
  );
}

function NavItem({
  item,
  adminBase,
  relPath,
  searchParams,
  collapsed,
  badge,
  onNavigate,
}: {
  item: AdminNavItem;
  adminBase: string;
  relPath: string;
  searchParams: URLSearchParams;
  collapsed: boolean;
  badge: number;
  onNavigate?: () => void;
}) {
  const Icon = NAV_ICONS[item.key] ?? FileText;
  const href = `${adminBase}${item.path}`;
  const isActive = isNavItemActive(item, relPath);
  const activeChild = item.children ? activeNavChild(item, relPath, searchParams) : null;
  const label = badge > 0 ? `${item.label} (${badge})` : item.label;
  // Sub-items start open on their section, and the admin can toggle them.
  const [openState, setOpenState] = useState<{ open: boolean; forPath: boolean } | null>(null);
  const open = openState && openState.forPath === isActive ? openState.open : isActive;

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive && !activeChild ? "page" : undefined}
      className={cn(
        "group flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
        isActive
          ? "font-medium text-sidebar-foreground"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
        // With an open sub-item active, that sub-item carries the highlight.
        isActive && (collapsed || !activeChild || !open)
          ? "bg-secondary"
          : "hover:bg-secondary",
        collapsed && "justify-center px-2"
      )}
    >
      <span className="relative shrink-0">
        <Icon strokeWidth={2} className="h-[18px] w-[18px] shrink-0" />
        {collapsed && badge > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 size-2 rounded-full bg-primary"
          />
        )}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && badge > 0 && (
        <span
          aria-label={`${badge} open`}
          className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.7rem] font-medium leading-none tabular-nums text-ink"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  if (!item.children) return link;

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => setOpenState({ open: next, forPath: isActive })}
    >
      <div className="flex items-center gap-0.5">
        {link}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={`${open ? "Hide" : "Show"} ${item.label} pages`}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/55 transition-colors hover:bg-secondary hover:text-sidebar-foreground"
          >
            <ChevronRight
              className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ul className="ml-[1.15rem] mt-0.5 space-y-0.5 border-l border-sidebar-foreground/10 pl-2">
          {item.children.map((child) => {
            const query = child.query ? `?${new URLSearchParams(child.query)}` : "";
            const childActive = activeChild?.key === child.key;
            return (
              <li key={child.key}>
                <Link
                  href={`${adminBase}${child.path}${query}`}
                  onClick={onNavigate}
                  aria-current={childActive ? "page" : undefined}
                  className={cn(
                    "block truncate rounded-lg px-2.5 py-1.5 text-[0.8125rem] transition-colors",
                    childActive
                      ? "bg-secondary font-medium text-sidebar-foreground"
                      : "text-sidebar-foreground/65 hover:bg-secondary hover:text-sidebar-foreground"
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
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
      className="hidden md:flex h-screen flex-col bg-transparent relative z-20 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <AdminSidebarContent />
    </motion.aside>
  );
}
