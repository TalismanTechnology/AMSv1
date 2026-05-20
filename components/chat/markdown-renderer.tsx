"use client";

import { Children, Fragment, useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatSource } from "@/lib/types";

interface MarkdownRendererProps {
  content: string;
  sources?: ChatSource[];
  onSourceClick?: (source: ChatSource) => void;
  messageId?: string;
  skipCitationAnimation?: boolean;
}

const CITATION_RE = /\[(\d+)\]/g;

// Tracks citation pops that have already played this session, so re-mounts
// (typewriter → static swap, scroll re-renders) don't re-pop.
const playedCitations = new Set<string>();

const BADGE_CLASS =
  "mx-0.5 inline-flex h-[1.1em] min-w-[1.1em] items-center justify-center rounded-sm border border-glass-border metallic-surface px-[0.25em] align-[0.15em] text-[0.7em] font-medium neon-icon-blue leading-none transition-colors hover:bg-primary/15 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer";

function CitationBadge({
  n,
  onClick,
  title,
  animKey,
  skipAnimation,
}: {
  n: number;
  onClick?: () => void;
  title?: string;
  animKey?: string;
  skipAnimation?: boolean;
}) {
  const alreadyPlayed =
    skipAnimation || !animKey || playedCitations.has(animKey);
  const playedRef = useRef(alreadyPlayed);

  useEffect(() => {
    if (animKey) playedCitations.add(animKey);
  }, [animKey]);

  if (playedRef.current) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title ? `Source ${n}: ${title}` : `Source ${n}`}
        className={BADGE_CLASS}
      >
        {n}
      </button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title ? `Source ${n}: ${title}` : `Source ${n}`}
      className={BADGE_CLASS}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
      transition={{ duration: 0.45, times: [0, 0.55, 1], ease: "easeOut" }}
    >
      {n}
    </motion.button>
  );
}

// Walk a ReactMarkdown children tree, replacing [N] occurrences inside text
// nodes with clickable CitationBadge buttons. Non-text children pass through.
function renderWithCitations(
  children: ReactNode,
  sources: ChatSource[] | undefined,
  onSourceClick: ((source: ChatSource) => void) | undefined,
  messageId: string | undefined,
  skipAnimation: boolean
): ReactNode {
  if (!sources || sources.length === 0) return children;

  return Children.map(children, (child, idx) => {
    if (typeof child !== "string") return child;

    const parts: ReactNode[] = [];
    let cursor = 0;
    CITATION_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CITATION_RE.exec(child)) !== null) {
      const n = parseInt(match[1], 10);
      const source = sources.find((s) => s.source_number === n);
      if (!source) continue; // leave bogus [N] in place (will be added below)

      if (match.index > cursor) {
        parts.push(child.slice(cursor, match.index));
      }
      const tooltip = source.location?.label
        ? `${source.title} — ${source.location.label}`
        : source.title;
      const animKey = messageId
        ? `${messageId}-${match.index}-${n}`
        : undefined;
      parts.push(
        <CitationBadge
          key={animKey ?? `cite-${idx}-${match.index}-${n}`}
          n={n}
          title={tooltip}
          onClick={onSourceClick ? () => onSourceClick(source) : undefined}
          animKey={animKey}
          skipAnimation={skipAnimation}
        />
      );
      cursor = match.index + match[0].length;
    }

    if (cursor === 0) return child;
    if (cursor < child.length) parts.push(child.slice(cursor));
    return <Fragment key={`cf-${idx}`}>{parts}</Fragment>;
  });
}

export function MarkdownRenderer({
  content,
  sources,
  onSourceClick,
  messageId,
  skipCitationAnimation,
}: MarkdownRendererProps) {
  // Also strip the older `[Source N]` form in case any cached responses include it
  const processedContent = content.replace(/\[Source\s+(\d+)\]/gi, "[$1]");
  const withCites = (children: ReactNode) =>
    renderWithCitations(
      children,
      sources,
      onSourceClick,
      messageId,
      !!skipCitationAnimation
    );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 last:mb-0">{withCites(children)}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold">{withCites(children)}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{withCites(children)}</em>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm">{withCites(children)}</li>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isInline = !className;
          return isInline ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              {children}
            </code>
          ) : (
            <pre className="rounded-lg bg-muted p-3 overflow-x-auto mb-2">
              <code className="text-xs font-mono">{children}</code>
            </pre>
          );
        },
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mb-2 mt-3">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mb-2 mt-3">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/30 pl-3 italic text-muted-foreground mb-2">
            {withCites(children)}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="min-w-full text-sm border-collapse">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border px-2 py-1 bg-muted font-medium text-left">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-2 py-1">
            {withCites(children)}
          </td>
        ),
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
}
