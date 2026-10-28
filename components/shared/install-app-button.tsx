"use client";

import { MonitorDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { promptInstall, useInstallUi } from "@/lib/pwa/install-prompt";

const LABEL = "Install app";

interface InstallAppButtonProps {
  /** Icon only, with the label in a tooltip (the collapsed sidebar rail). */
  collapsed?: boolean;
  className?: string;
  iconClassName?: string;
  /** Where the Safari tip opens. */
  tipSide?: "top" | "right" | "bottom" | "left";
  tipAlign?: "start" | "center" | "end";
}

// "Install app" for browsers that can install the site: Chrome / Edge's own
// install dialog, or a tip for Safari's File > Add to Dock. Renders nothing
// anywhere else (lib/pwa/install-platform.ts).
export function InstallAppButton({
  collapsed = false,
  className,
  iconClassName = "h-4 w-4",
  tipSide = "top",
  tipAlign = "start",
}: InstallAppButtonProps) {
  const ui = useInstallUi();

  if (ui === "hidden") return null;

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={collapsed ? LABEL : undefined}
      className={cn(collapsed ? "justify-center" : "justify-start gap-2.5", className)}
      onClick={ui === "prompt" ? () => void promptInstall() : undefined}
    >
      <MonitorDown className={iconClassName} />
      {!collapsed && LABEL}
    </Button>
  );

  const trigger =
    ui === "safari-tip" ? <PopoverTrigger asChild>{button}</PopoverTrigger> : button;

  const withTooltip = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="right">{LABEL}</TooltipContent>
    </Tooltip>
  ) : (
    trigger
  );

  if (ui !== "safari-tip") return withTooltip;

  return (
    <Popover>
      {withTooltip}
      <PopoverContent side={tipSide} align={tipAlign} className="w-64 text-sm text-ink">
        In Safari, choose <span className="font-medium">File &gt; Add to Dock</span>.
      </PopoverContent>
    </Popover>
  );
}
