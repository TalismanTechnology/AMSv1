"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitFeedback } from "@/actions/feedback";
import { cn } from "@/lib/utils";

interface MessageFeedbackProps {
  messageId: string;
  schoolId?: string;
}

export function MessageFeedback({ messageId, schoolId }: MessageFeedbackProps) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRate(value: "up" | "down") {
    if (submitting) return;
    setSubmitting(true);
    const newRating = rating === value ? null : value;

    // Optimistic update
    setRating(newRating);

    if (newRating) {
      const result = await submitFeedback(messageId, newRating, schoolId);
      if (result.error) setRating(rating); // revert on error
    }
    setSubmitting(false);
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 rounded-md transition-colors",
          rating === "up"
            ? "text-ink"
            : "text-muted-foreground/50 hover:bg-secondary hover:text-ink"
        )}
        onClick={() => handleRate("up")}
        disabled={submitting}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 rounded-md transition-colors",
          rating === "down"
            ? "text-destructive"
            : "text-muted-foreground/50 hover:bg-secondary hover:text-ink"
        )}
        onClick={() => handleRate("down")}
        disabled={submitting}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
