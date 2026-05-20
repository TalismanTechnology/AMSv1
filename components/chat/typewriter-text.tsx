"use client";

import { useTypewriter } from "@/hooks/use-typewriter";
import { MarkdownRenderer } from "./markdown-renderer";
import type { ChatSource } from "@/lib/types";

interface TypewriterTextProps {
  content: string;
  speed?: number;
  sources?: ChatSource[];
  onSourceClick?: (source: ChatSource) => void;
  onComplete?: () => void;
  messageId?: string;
  skipCitationAnimation?: boolean;
}

export function TypewriterText({
  content,
  speed = 20,
  sources,
  onSourceClick,
  onComplete,
  messageId,
  skipCitationAnimation,
}: TypewriterTextProps) {
  const { displayText, isTyping } = useTypewriter(content, {
    speed,
    onComplete,
  });

  return (
    <div className="relative">
      <MarkdownRenderer
        content={displayText}
        sources={sources}
        onSourceClick={onSourceClick}
        messageId={messageId}
        skipCitationAnimation={skipCitationAnimation}
      />
      {isTyping && (
        <span className="caret-glow ml-0.5 inline-block h-4 w-0.5 align-text-bottom" />
      )}
    </div>
  );
}
