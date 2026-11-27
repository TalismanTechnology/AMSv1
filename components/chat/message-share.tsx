"use client";

import { Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getNativePlatform } from "@/lib/native/platform";
import { impactHaptic, successHaptic } from "@/lib/native/haptics";
import { shareableAnswer } from "@/lib/share-answer";
import type { ChatSource } from "@/lib/types";
import { IconBadge } from "./icon-badge";
import { useT } from "@/components/i18n/locale-provider";
import type { Translate } from "@/lib/i18n/translate";

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

/**
 * shareableAnswer's text with its two English labels ("Sources:" and the
 * closing "From AskMySchool") in the UI language. The sources block is the
 * last one before the closing line, so it is found from the end.
 */
function localizedShareText(text: string, t: Translate): string {
  const from = "\n\nFrom AskMySchool";
  let out = text.endsWith(from) ? text.slice(0, -from.length) : text;
  const heading = "\n\nSources:\n";
  const at = out.lastIndexOf(heading);
  if (at >= 0) {
    out = `${out.slice(0, at)}\n\n${t("chat.shareSourcesHeading")}\n${out.slice(at + heading.length)}`;
  }
  return text.endsWith(from) ? `${out}\n\n${t("chat.shareFrom")}` : out;
}

export function MessageShare({ content, sources }: MessageShareProps) {
  const t = useT();

  async function handleShare() {
    const text = localizedShareText(shareableAnswer(content, sources), t);
    const title = t("chat.shareTitle");

    try {
      if (getNativePlatform()) {
        void impactHaptic();
        const { Share: NativeShare } = await import("@capacitor/share");
        await NativeShare.share({ title, text, dialogTitle: t("chat.shareAnswer") });
        return;
      }

      if (typeof navigator.share === "function") {
        await navigator.share({ title, text });
        return;
      }

      await navigator.clipboard.writeText(text);
      void successHaptic();
      toast.success(t("chat.answerCopied"));
    } catch (caught: unknown) {
      if (isCancel(caught)) return;
      console.error("[chat] share failed", caught);
      toast.error(t("chat.shareFailed"));
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="group h-7 w-7 rounded-md transition-colors"
      onClick={() => void handleShare()}
      aria-label={t("chat.shareAnswer")}
      title={t("chat.shareAnswer")}
    >
      <IconBadge className="group-hover:bg-brand-badge-strong">
        <Share className="size-3" />
      </IconBadge>
    </Button>
  );
}
