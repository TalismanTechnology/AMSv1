"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSchool } from "./school-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GraduationCap, ArrowLeftRight } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { useT } from "@/components/i18n/locale-provider";
import type { Translate } from "@/lib/i18n/translate";

/** "(admin)" / "(parent)"; any other stored role as written. */
function roleLabel(role: string, t: Translate): string {
  if (role === "admin") return t("parent.schoolSwitcher.role.admin");
  if (role === "parent") return t("parent.schoolSwitcher.role.parent");
  return role;
}

interface SchoolSwitcherProps {
  collapsed?: boolean;
}

export function SchoolSwitcher({ collapsed = false }: SchoolSwitcherProps) {
  const { school, memberships } = useSchool();
  const router = useRouter();
  // Pending until the other school's page has rendered.
  const [switching, startSwitch] = useTransition();
  // English outside the parent area's locale provider (admin sidebar).
  const t = useT();

  if (memberships.length <= 1) return null;

  const goToMembership = (schoolId: string) => {
    const target = memberships.find((m) => m.school_id === schoolId);
    if (target?.school?.slug) {
      const role = target.role;
      const href = `/s/${target.school.slug}/${role === "admin" ? "admin" : "parent"}`;
      startSwitch(() => router.push(href));
    }
  };

  // With exactly 2 schools, show a one-click toggle to the other school.
  if (memberships.length === 2) {
    const other = memberships.find((m) => m.school_id !== school.id);
    if (!other) return null;
    const otherName = other.school?.name || t("parent.schoolSwitcher.otherSchool");
    const label = t("parent.schoolSwitcher.switchTo", { school: otherName });

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-full"
              onClick={() => goToMembership(other.school_id)}
              disabled={switching}
              aria-busy={switching}
              aria-label={switching ? t("parent.schoolSwitcher.switching") : label}
            >
              {switching ? <LogoSpinner /> : <ArrowLeftRight className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 h-8 text-xs"
        onClick={() => goToMembership(other.school_id)}
        disabled={switching}
        aria-busy={switching}
      >
        {switching ? (
          <LogoSpinner size={14} />
        ) : (
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{switching ? t("parent.schoolSwitcher.switching") : label}</span>
      </Button>
    );
  }

  // 3+ schools: dropdown selector.
  if (collapsed) {
    return (
      <Select value={school.id} onValueChange={goToMembership} disabled={switching}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger
              aria-label={
                switching
                  ? t("parent.schoolSwitcher.switching")
                  : t("parent.schoolSwitcher.switchSchool")
              }
              aria-busy={switching}
              className="w-full h-8 justify-center [&>svg:last-child]:hidden"
            >
              {switching ? <LogoSpinner /> : <GraduationCap className="h-4 w-4" />}
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{t("parent.schoolSwitcher.switchSchool")}</TooltipContent>
        </Tooltip>
        <SelectContent>
          {memberships.map((m) => (
            <SelectItem key={m.school_id} value={m.school_id}>
              <span className="truncate">
                {m.school?.name || t("parent.schoolSwitcher.unknownSchool")}
              </span>
              <span className="ml-1 text-muted-foreground">({roleLabel(m.role, t)})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select value={school.id} onValueChange={goToMembership} disabled={switching}>
      <SelectTrigger className="w-full h-8 text-xs" aria-busy={switching}>
        {switching ? (
          <LogoSpinner size={14} className="mr-1 shrink-0" />
        ) : (
          <GraduationCap className="mr-1 h-3.5 w-3.5 shrink-0" />
        )}
        {switching && <span className="truncate">{t("parent.schoolSwitcher.switching")}</span>}
        <span className={switching ? "hidden" : "contents"}>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {memberships.map((m) => (
          <SelectItem key={m.school_id} value={m.school_id}>
            <span className="truncate">
              {m.school?.name || t("parent.schoolSwitcher.unknownSchool")}
            </span>
            <span className="ml-1 text-muted-foreground">({roleLabel(m.role, t)})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
