"use client";

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

interface SchoolSwitcherProps {
  collapsed?: boolean;
}

export function SchoolSwitcher({ collapsed = false }: SchoolSwitcherProps) {
  const { school, memberships } = useSchool();
  const router = useRouter();

  if (memberships.length <= 1) return null;

  const goToMembership = (schoolId: string) => {
    const target = memberships.find((m) => m.school_id === schoolId);
    if (target?.school?.slug) {
      const role = target.role;
      router.push(
        `/s/${target.school.slug}/${role === "admin" ? "admin" : "parent"}`
      );
    }
  };

  // With exactly 2 schools, show a one-click toggle to the other school.
  if (memberships.length === 2) {
    const other = memberships.find((m) => m.school_id !== school.id);
    if (!other) return null;
    const otherName = other.school?.name || "Other school";
    const label = `Switch to ${otherName}`;

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-full"
              onClick={() => goToMembership(other.school_id)}
              aria-label={label}
            >
              <ArrowLeftRight className="h-4 w-4" />
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
      >
        <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Switch to {otherName}</span>
      </Button>
    );
  }

  // 3+ schools: dropdown selector.
  if (collapsed) {
    return (
      <Select value={school.id} onValueChange={goToMembership}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger
              aria-label="Switch school"
              className="w-full h-8 justify-center [&>svg:last-child]:hidden"
            >
              <GraduationCap className="h-4 w-4" />
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Switch school</TooltipContent>
        </Tooltip>
        <SelectContent>
          {memberships.map((m) => (
            <SelectItem key={m.school_id} value={m.school_id}>
              <span className="truncate">
                {m.school?.name || "Unknown School"}
              </span>
              <span className="ml-1 text-muted-foreground">({m.role})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select value={school.id} onValueChange={goToMembership}>
      <SelectTrigger className="w-full h-8 text-xs">
        <GraduationCap className="mr-1 h-3.5 w-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {memberships.map((m) => (
          <SelectItem key={m.school_id} value={m.school_id}>
            <span className="truncate">
              {m.school?.name || "Unknown School"}
            </span>
            <span className="ml-1 text-muted-foreground">({m.role})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
