"use client";

import { useState, useEffect, useCallback } from "react";
import { User, Sparkles } from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";
import { TypewriterText } from "./typewriter-text";
import { FollowUpChips } from "./follow-up-chips";
import { MessageFeedback } from "./message-feedback";
import { SourceCard } from "./source-card";
import { useSourcePanel } from "./source-panel-context";
import { CursorSpotlight } from "@/components/motion/cursor-spotlight";
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
      <div className="flex justify-end gap-2.5">
        <div className="glass-noise max-w-[80%] rounded-2xl rounded-tr-sm border border-primary/25 bg-primary/10 px-3.5 py-2 text-sm text-foreground">
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-glass-border bg-primary/15">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
      </div>
    );
  }

  const sortedSources = sources?.length
    ? [...sources].sort(
        (a, b) => (a.source_number ?? 0) - (b.source_number ?? 0)
      )
    : [];

  return (
    <div className="flex flex-col gap-2">
      <CursorSpotlight radius={360} intensity={0.07} className="rounded-lg">
        <div className="metallic-surface glass-noise relative rounded-lg border border-glass-border p-3.5">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="flex h-4 w-4 items-center justify-center rounded-sm border border-glass-border bg-muted/40">
              <Sparkles className="h-2.5 w-2.5 text-muted-foreground" />
            </div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              AskMySchool
            </p>
          </div>
          <div className="text-sm leading-relaxed text-foreground">
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
        </div>
      </CursorSpotlight>

      {messageId && (
        <MessageFeedback messageId={messageId} schoolId={schoolId} />
      )}

      {sortedSources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sortedSources.map((source) => (
            <SourceCard
              key={`${source.document_id}-${source.source_number}`}
              source={source}
              index={source.source_number}
            />
          ))}
        </div>
      )}

      {isLastAssistant && followUps.length > 0 && onFollowUpSelect && (
        <FollowUpChips followUps={followUps} onSelect={onFollowUpSelect} />
      )}
    </div>
  );
}
