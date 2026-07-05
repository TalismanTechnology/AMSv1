"use client";

import { useState, useEffect, useCallback } from "react";
import { MarkdownRenderer } from "./markdown-renderer";
import { TypewriterText } from "./typewriter-text";
import { FollowUpChips } from "./follow-up-chips";
import { MessageFeedback } from "./message-feedback";
import { SourceCard } from "./source-card";
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

  // Documents are always shown as source cards; non-document sources (events,
  // announcements) come from the full calendar/board and are only surfaced when
  // the answer actually cites them, so we don't dump the whole calendar.
  const citedNumbers = new Set(
    [...displayContent.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
  );
  const sortedSources = sources?.length
    ? [...sources]
        .filter((s) => {
          const type = s.source_type ?? "document";
          if (type === "document") return true;
          return s.source_number != null && citedNumbers.has(s.source_number);
        })
        .sort((a, b) => (a.source_number ?? 0) - (b.source_number ?? 0))
    : [];

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

      {sortedSources.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="mb-1 text-xs text-muted-foreground">Sources</p>
          {sortedSources.map((source) => (
            <SourceCard
              key={`${source.document_id}-${source.source_number}`}
              source={source}
              index={source.source_number}
            />
          ))}
        </div>
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
