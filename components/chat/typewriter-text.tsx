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
}

export function TypewriterText({ content, speed = 20, sources, onSourceClick, onComplete }: TypewriterTextProps) {
  const { displayText, isTyping } = useTypewriter(content, { speed, onComplete });

  return (
    <div className="relative">
      <MarkdownRenderer content={displayText} sources={sources} onSourceClick={onSourceClick} />
      {isTyping && (
        <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
      )}
    </div>
  );
}
