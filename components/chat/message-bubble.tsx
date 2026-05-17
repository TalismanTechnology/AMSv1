"use client";

import { useState, useEffect, useCallback } from "react";
import { User, Bot, ChevronDown } from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";
import { TypewriterText } from "./typewriter-text";
import { DocumentPreviewCard } from "./document-preview-card";
import { FollowUpChips } from "./follow-up-chips";
import { MessageFeedback } from "./message-feedback";
import { useSourcePanel } from "./source-panel-context";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { parseFollowUps } from "@/lib/chat-utils";
import { cn } from "@/lib/utils";
import type { ChatSource } from "@/lib/types";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  messageId?: string;
  schoolId?: string;
  sources?: ChatSource[];
  isLastAssistant?: boolean;
  isStreaming?: boolean;
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

  const { content: displayContent, followUps } =
    !isUser ? parseFollowUps(content) : { content, followUps: [] };

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-primary/15" : "bg-muted"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div
        className={`max-w-[80%] space-y-2 ${isUser ? "text-right" : "text-left"}`}
      >
        <div
          className={`inline-block rounded-2xl px-4 py-2.5 text-sm ${
            isUser
              ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/15%)]"
              : "bg-card text-foreground border border-border metallic-card"
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : showTypewriter ? (
            <TypewriterText content={displayContent} sources={sources} onSourceClick={openSource} onComplete={handleTypewriterComplete} />
          ) : (
            <MarkdownRenderer content={displayContent} sources={sources} onSourceClick={openSource} />
          )}
        </div>
        {!isUser && messageId && <MessageFeedback messageId={messageId} schoolId={schoolId} />}
        {sources && sources.length > 0 && <SourcesList sources={sources} />}
        {isLastAssistant && followUps.length > 0 && onFollowUpSelect && (
          <FollowUpChips followUps={followUps} onSelect={onFollowUpSelect} />
        )}
      </div>
    </div>
  );
}

function SourcesList({ sources }: { sources: ChatSource[] }) {
  const [isOpen, setIsOpen] = useState(false);

  // Sources arrive pre-numbered from the server (source_number 1..N) and the
  // numbering already matches the inline [N] citation badges in the answer.
  // Sort by source_number so the order matches the inline citations.
  const ordered = [...sources].sort(
    (a, b) => (a.source_number ?? 0) - (b.source_number ?? 0)
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
        Sources ({ordered.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 pt-1.5">
        {ordered.map((source) => (
          <DocumentPreviewCard
            key={`${source.document_id}-${source.source_number}`}
            source={source}
            index={source.source_number}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
