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
import { GraduationCap } from "lucide-react";

export function SchoolSwitcher() {
  const { school, memberships } = useSchool();
  const router = useRouter();

  if (memberships.length <= 1) return null;

  return (
    <Select
      value={school.id}
      onValueChange={(schoolId) => {
        const target = memberships.find((m) => m.school_id === schoolId);
        if (target?.school?.slug) {
          const role = target.role;
          router.push(
            `/s/${target.school.slug}/${role === "admin" ? "admin" : "parent"}`
          );
        }
      }}
    >
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
            <span className="ml-1 text-muted-foreground">
              ({m.role})
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
