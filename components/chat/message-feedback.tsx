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
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-6 w-6",
          rating === "up"
            ? "text-green-500"
            : "text-muted-foreground/40 hover:text-muted-foreground"
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
          "h-6 w-6",
          rating === "down"
            ? "text-red-500"
            : "text-muted-foreground/40 hover:text-muted-foreground"
        )}
        onClick={() => handleRate("down")}
        disabled={submitting}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
