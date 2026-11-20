"use client";

import { Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getNativePlatform } from "@/lib/native/platform";
import { impactHaptic, successHaptic } from "@/lib/native/haptics";
import { shareableAnswer } from "@/lib/share-answer";
import type { ChatSource } from "@/lib/types";
import { IconBadge } from "./icon-badge";

// Share an answer (with the documents it cites). In the iOS / Android app this
// is the native share sheet; on the web, the browser's share sheet where there
// is one (phones), otherwise the clipboard.

interface MessageShareProps {
  content: string;
  sources?: ChatSource[];
}

function isCancel(caught: unknown): boolean {
  const message = (caught as { message?: string; name?: string } | null) ?? {};
  return message.name === "AbortError" || /cancel/i.test(message.message ?? "");
}

export function MessageShare({ content, sources }: MessageShareProps) {
  async function handleShare() {
    const text = shareableAnswer(content, sources);

    try {
      if (getNativePlatform()) {
        void impactHaptic();
        const { Share: NativeShare } = await import("@capacitor/share");
        await NativeShare.share({ title: "AskMySchool answer", text, dialogTitle: "Share answer" });
        return;
      }

      if (typeof navigator.share === "function") {
        await navigator.share({ title: "AskMySchool answer", text });
        return;
      }

      await navigator.clipboard.writeText(text);
      void successHaptic();
      toast.success("Answer copied");
    } catch (caught: unknown) {
      if (isCancel(caught)) return;
      console.error("[chat] share failed", caught);
      toast.error("Couldn't share this answer");
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="group h-7 w-7 rounded-md transition-colors"
      onClick={() => void handleShare()}
      aria-label="Share answer"
      title="Share answer"
    >
      <IconBadge className="group-hover:bg-brand-badge-strong">
        <Share className="size-3" />
      </IconBadge>
    </Button>
  );
}
