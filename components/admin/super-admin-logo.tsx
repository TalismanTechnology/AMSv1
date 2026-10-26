"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { useSchool } from "@/components/shared/school-context";
import { useLongPress } from "@/components/dev-panel/lib/use-long-press";

// Holding the sidebar logo is a hidden shortcut to the super admin console.
// It does nothing for anyone else; /super-admin checks the role on the
// server regardless, so this only decides whether to offer the shortcut.
const HOLD_MS = 5000;

interface SuperAdminLogoProps {
  collapsed: boolean;
}

export function SuperAdminLogo({ collapsed }: SuperAdminLogoProps) {
  const router = useRouter();
  const { isSuperAdmin } = useSchool();

  const openConsole = useCallback(() => {
    if (isSuperAdmin) router.push("/super-admin");
  }, [isSuperAdmin, router]);

  const { handlers } = useLongPress({ duration: HOLD_MS, onLongPress: openConsole });

  return (
    <div className="relative inline-flex select-none items-center justify-center" {...handlers}>
      <Logo size={collapsed ? 16 : 28} className="shrink-0 text-primary" />
    </div>
  );
}
