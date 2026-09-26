"use client";

import { useState, useEffect, useCallback } from "react";
import { MarkdownRenderer } from "./markdown-renderer";
import { TypewriterText } from "./typewriter-text";
import { FollowUpChips } from "./follow-up-chips";
import { MessageFeedback } from "./message-feedback";
import { SourceList } from "./source-list";
import { useSourcePanel } from "./source-panel-context";
import { parseFollowUps } from "@/lib/chat-utils";
import type { ChatSource } from "@/lib/types";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  messageId?: string;
  schoolId?: string;
  sources?: ChatSource[];
  isLastAssistant?: boolean;
  isStreaming?: boolean;
  skipAnimations?: boolean;
  onFollowUpSelect?: (question: string) => void;
}

export function MessageBubble({
  role,
  content,
  messageId,
  schoolId,
  sources,
  isLastAssistant,
  isStreaming,
  skipAnimations,
  onFollowUpSelect,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const { openSource } = useSourcePanel();

  // Stay in typewriter mode until the typing effect finishes catching up,
  // not just while the API stream is active
  const [typewriterActive, setTypewriterActive] = useState(false);

  useEffect(() => {
    if (isStreaming) setTypewriterActive(true);
  }, [isStreaming]);

  const handleTypewriterComplete = useCallback(() => {
    setTypewriterActive(false);
  }, []);

  const showTypewriter = isStreaming || typewriterActive;

  const { content: displayContent, followUps } = !isUser
    ? parseFollowUps(content)
    : { content, followUps: [] };

  if (isUser) {
    return (
      <div className="flex justify-end">
        {/* Subtle warm-sand bubble, right-aligned */}
        <div className="max-w-[80%] rounded-2xl bg-secondary px-4 py-2.5 text-sm leading-relaxed text-ink">
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
      </div>
    );
  }

  const citedNumbers = new Set(
    [...displayContent.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Answer text rendered directly on the page — no bubble */}
      <div className="text-[0.95rem] leading-relaxed text-ink">
        {showTypewriter ? (
          <TypewriterText
            content={displayContent}
            sources={sources}
            onSourceClick={openSource}
            onComplete={handleTypewriterComplete}
            messageId={messageId}
            skipCitationAnimation={skipAnimations}
          />
        ) : (
          <MarkdownRenderer
            content={displayContent}
            sources={sources}
            onSourceClick={openSource}
            messageId={messageId}
            skipCitationAnimation={skipAnimations}
          />
        )}
      </div>

      {sources && sources.length > 0 && (
        <SourceList sources={sources} citedNumbers={citedNumbers} />
      )}

      {messageId && (
        <MessageFeedback messageId={messageId} schoolId={schoolId} />
      )}

      {isLastAssistant && followUps.length > 0 && onFollowUpSelect && (
        <FollowUpChips followUps={followUps} onSelect={onFollowUpSelect} />
      )}
    </div>
  );
}
