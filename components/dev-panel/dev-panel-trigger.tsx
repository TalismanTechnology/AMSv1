"use client";

import { Logo } from "@/components/logo";
import { useSchool } from "@/components/shared/school-context";
import { useLongPress } from "./lib/use-long-press";
import { useDevPanel } from "./lib/use-dev-panel";
import { PasswordDialog } from "./password-dialog";
import { DevPanelDrawer } from "./dev-panel-drawer";

interface DevPanelTriggerProps {
  collapsed: boolean;
}

export function DevPanelTrigger({ collapsed }: DevPanelTriggerProps) {
  const { school } = useSchool();
  const {
    isDrawerOpen,
    showPasswordDialog,
    handleLongPress,
    handlePasswordSubmit,
    closeDrawer,
    closePasswordDialog,
  } = useDevPanel();

  const { handlers } = useLongPress({
    duration: 5000,
    onLongPress: handleLongPress,
  });

  const logoSize = collapsed ? 16 : 28;

  return (
    <>
      <div className="relative inline-flex items-center justify-center select-none cursor-pointer" {...handlers}>
        <Logo
          size={logoSize}
          className="shrink-0 text-primary drop-shadow-[0_0_8px_var(--glow-primary)] drop-shadow-[0_0_12px_oklch(1_0_0/40%)]"
        />
      </div>

      <PasswordDialog
        open={showPasswordDialog}
        onClose={closePasswordDialog}
        onSubmit={handlePasswordSubmit}
      />

      <DevPanelDrawer
        open={isDrawerOpen}
        onClose={closeDrawer}
        schoolId={school.id}
      />
    </>
  );
}
