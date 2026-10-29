"use client";

import { useState, useCallback } from "react";
import { Search } from "lucide-react";
import { MarkdownRenderer } from "./lazy-markdown-renderer";
import { TypewriterText } from "./typewriter-text";
import { FollowUpChips } from "./follow-up-chips";
import { MessageFeedback } from "./message-feedback";
import { MessageShare } from "./message-share";
import { SourceList } from "./source-list";
import { ContactCard } from "./contact-card";
import { useSourcePanel } from "./source-panel-context";
import { parseFollowUps } from "@/lib/chat-utils";
import { citedNumbersInOrder, renumberCitations } from "@/lib/ai/citations";
import type { ChatSource } from "@/lib/types";
import type { ContactCardData } from "@/lib/contacts/directory";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  messageId?: string;
  schoolId?: string;
  sources?: ChatSource[];
  /** The staff contact an unanswered question was routed to. */
  contact?: ContactCardData;
  /**
   * Set when no school documents matched: the parent's question. Offered as a
   * Google search under the answer only if the model also flagged its reply
   * as a genuine "couldn't find it" (the NOT_FOUND line in the follow-up
   * block) — not a greeting, an off-topic reply, or a calendar answer. The AI
   * itself still answers only from school material.
   */
  webSearchQuery?: string;
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
  sources: rawSources,
  contact,
  webSearchQuery,
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

  // Turn typewriter mode on whenever streaming starts (adjusting state while
  // rendering, rather than in an effect, avoids an extra commit).
  const [prevStreaming, setPrevStreaming] = useState(false);
  if (!!isStreaming !== prevStreaming) {
    setPrevStreaming(!!isStreaming);
    if (isStreaming) setTypewriterActive(true);
  }

  const handleTypewriterComplete = useCallback(() => {
    setTypewriterActive(false);
  }, []);

  const showTypewriter = isStreaming || typewriterActive;

  const { content: answer, followUps, notFound } = !isUser
    ? parseFollowUps(content)
    : { content, followUps: [], notFound: false };
  // Citations as the parent sees them: [1], [2]… in order of first
  // appearance, with the sources renumbered to match. Answers saved before
  // renumbering existed are renumbered here too; newer ones are unchanged.
  const { content: displayContent, sources } = renumberCitations(answer, rawSources);

  if (isUser) {
    return (
      <div className="flex justify-end">
        {/* Subtle warm-sand bubble, right-aligned */}
        <div className="max-w-[80%] rounded-2xl bg-secondary px-5 py-3 text-sm leading-relaxed text-ink">
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
      </div>
    );
  }

  // Share once the answer has finished arriving.
  const canShare = !showTypewriter && displayContent.trim().length > 0;

  const citedNumbers = new Set(citedNumbersInOrder(displayContent));

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

      {/* Shown once the answer that points to it has finished arriving. */}
      {contact && !showTypewriter && <ContactCard contact={contact} />}

      {webSearchQuery?.trim() && notFound && !showTypewriter && (
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(webSearchQuery.trim())}`}
          target="_blank"
          rel="noopener"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          <Search className="size-3.5" aria-hidden />
          Search the web
        </a>
      )}

      {sources && sources.length > 0 && (
        <SourceList sources={sources} citedNumbers={citedNumbers} />
      )}

      {(messageId || canShare) && (
        <div className="flex items-center gap-0.5">
          {messageId && <MessageFeedback messageId={messageId} schoolId={schoolId} />}
          {canShare && <MessageShare content={displayContent} sources={sources} />}
        </div>
      )}

      {isLastAssistant && followUps.length > 0 && onFollowUpSelect && (
        <FollowUpChips followUps={followUps} onSelect={onFollowUpSelect} />
      )}
    </div>
  );
}
