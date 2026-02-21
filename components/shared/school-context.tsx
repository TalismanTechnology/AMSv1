"use client";

import { createContext, useContext } from "react";
import type { School, SchoolMembership, UserRole } from "@/lib/types";

interface SchoolContextValue {
  school: School;
  role: UserRole;
  slug: string;
  isSuperAdmin: boolean;
  memberships: SchoolMembership[];
  disableAnimations: boolean;
}

const SchoolContext = createContext<SchoolContextValue | null>(null);

export function SchoolProvider({
  school,
  role,
  isSuperAdmin,
  memberships,
  disableAnimations = false,
  children,
}: {
  school: School;
  role: UserRole;
  isSuperAdmin: boolean;
  memberships: SchoolMembership[];
  disableAnimations?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SchoolContext.Provider
      value={{ school, role, slug: school.slug, isSuperAdmin, memberships, disableAnimations }}
    >
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchool must be used within SchoolProvider");
  return ctx;
}

/** Safe version that returns null outside SchoolProvider (e.g. landing page). */
export function useSchoolMaybe() {
  return useContext(SchoolContext);
}
