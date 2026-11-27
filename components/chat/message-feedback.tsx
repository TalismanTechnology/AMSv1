"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearFeedback, submitFeedback } from "@/actions/feedback";
import { cn } from "@/lib/utils";
import { IconBadge } from "./icon-badge";
import { useT } from "@/components/i18n/locale-provider";

// Selected: darker forest fill, a brand-green ring and a filled glyph.
const SELECTED = "bg-brand-badge-strong ring-2 ring-brand-badge ring-offset-1 ring-offset-background";
const UNSELECTED = "group-hover:bg-brand-badge-strong";

interface MessageFeedbackProps {
  messageId: string;
  schoolId?: string;
}

export function MessageFeedback({ messageId, schoolId }: MessageFeedbackProps) {
  const t = useT();
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRate(value: "up" | "down") {
    if (submitting) return;
    setSubmitting(true);
    const newRating = rating === value ? null : value;

    // Optimistic update
    setRating(newRating);

    const result = newRating
      ? await submitFeedback(messageId, newRating, schoolId)
      : await clearFeedback(messageId);
    if (result.error) setRating(rating); // revert on error
    setSubmitting(false);
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="group h-7 w-7 rounded-md transition-colors"
        onClick={() => handleRate("up")}
        disabled={submitting}
        aria-label={t("chat.helpful")}
        aria-pressed={rating === "up"}
      >
        <IconBadge className={rating === "up" ? SELECTED : UNSELECTED}>
          <ThumbsUp className={cn("size-3", rating === "up" && "fill-current")} />
        </IconBadge>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="group h-7 w-7 rounded-md transition-colors"
        onClick={() => handleRate("down")}
        disabled={submitting}
        aria-label={t("chat.notHelpful")}
        aria-pressed={rating === "down"}
        title={t("chat.notHelpfulTitle")}
      >
        <IconBadge className={rating === "down" ? SELECTED : UNSELECTED}>
          <ThumbsDown className={cn("size-3", rating === "down" && "fill-current")} />
        </IconBadge>
      </Button>
    </div>
  );
}
