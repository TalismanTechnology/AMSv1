"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { ChevronDown, ExternalLink, Forward, Globe } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { ViewToggle, type SourceView } from "@/components/shared/view-toggle";
import { cn } from "@/lib/utils";
import { parseEmailText, splitQuoted, type EmailHeaders } from "@/lib/sources/email";
import {
  cleanWebsiteText,
  formatText,
  hostnameOf,
  parseInline,
  type Block,
} from "@/lib/sources/format-text";
import { locateHighlight } from "@/lib/sources/locate";

type SourceKind = "pdf" | "docx" | "image" | "email" | "website" | "text";

interface SourceResponse {
  document: {
    id: string;
    title: string;
    file_type: string;
    source: string;
    source_url: string | null;
    created_at: string;
  };
  kind: SourceKind;
  rawText: string | null;
  email: { headers: EmailHeaders; html: string | null } | null;
}

interface SourceRendererProps {
  /** Document to fetch. Omit to render `text` as-is (events, announcements). */
  documentId?: string;
  /** Text to show without fetching anything. */
  text?: string | null;
  fileType?: string;
  source?: string;
  sourceUrl?: string | null;
  title: string;
  /** A cited passage to highlight and scroll to. */
  highlight?: string | null;
  /** Text to use when the document has no stored text (saves a /content fetch). */
  fallbackText?: string | null;
  className?: string;
}

type Range = [number, number] | null;

const overlaps = (range: Range, start: number, end: number) =>
  !!range && range[0] < end && range[1] > start;

/**
 * A document's text shown the way it was meant to be read: emails with their
 * header card and original HTML, web pages with a link back to the page, and
 * plain text laid out as headings, paragraphs, lists and tables. A cited
 * passage is highlighted and scrolled into view.
 */
export function SourceRenderer({
  documentId,
  text,
  fileType,
  source,
  sourceUrl,
  title,
  highlight,
  fallbackText,
  className,
}: SourceRendererProps) {
  const [data, setData] = useState<SourceResponse | null>(null);
  const [rawText, setRawText] = useState<string | null>(documentId ? null : (text ?? null));
  const [loading, setLoading] = useState(!!documentId);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!documentId) {
      setData(null);
      setRawText(text ?? null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setData(null);
    setRawText(null);

    (async () => {
      let res: SourceResponse | null = null;
      try {
        const r = await fetch(`/api/documents/${documentId}/source`);
        if (r.ok) res = (await r.json()) as SourceResponse;
      } catch {
        // Fall through to the stitched-chunk text below.
      }
      let raw = res?.rawText ?? null;
      if (!raw) raw = fallbackText ?? null;
      if (!raw) {
        try {
          const r = await fetch(`/api/documents/${documentId}/content`);
          if (r.ok) raw = ((await r.json()) as { content?: string }).content ?? null;
        } catch {
          // Nothing to show; the empty state covers it.
        }
      }
      if (cancelled) return;
      setData(res);
      setRawText(raw);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // fallbackText only matters for the first load of a document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, text]);

  const range = useMemo(
    () => (rawText ? locateHighlight(rawText, highlight) : null),
    [rawText, highlight]
  );

  const kind: SourceKind =
    data?.kind ??
    (fileType === "eml" ? "email" : source === "website" ? "website" : "text");

  // Scroll the first highlighted element to the middle of the view. Waits for
  // the side panel's open animation (~300ms), whose in-flight layout would
  // otherwise put the target in the wrong place, and sets scrollTop on the
  // Radix viewport directly.
  useEffect(() => {
    if (loading || !range) return;
    const timeout = window.setTimeout(() => {
      const el = containerRef.current?.querySelector<HTMLElement>("[data-highlight]");
      if (!el) return;
      const viewport = el.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
      if (!viewport) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      const elTop = el.getBoundingClientRect().top;
      const vpTop = viewport.getBoundingClientRect().top;
      const target =
        viewport.scrollTop + (elTop - vpTop) - viewport.clientHeight / 2 + el.clientHeight / 2;
      viewport.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [loading, range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LogoSpinner size={24} />
      </div>
    );
  }

  const displayTitle = data?.document.title ?? title;
  const pageUrl = data?.document.source_url ?? sourceUrl ?? null;

  let body: React.ReactNode;
  if (kind === "email") {
    body = (
      <EmailView
        raw={rawText ?? ""}
        headers={data?.email?.headers ?? { subject: displayTitle }}
        html={data?.email?.html ?? null}
        range={range}
      />
    );
  } else if (kind === "website") {
    body = <WebsiteView raw={rawText ?? ""} title={displayTitle} url={pageUrl} range={range} />;
  } else if (rawText?.trim()) {
    body = <FormattedText raw={rawText} start={0} end={rawText.length} range={range} />;
  } else {
    body = <p className="py-8 text-center text-sm text-muted-foreground">No text to show for this document.</p>;
  }

  return (
    <div ref={containerRef} className={cn("mx-auto w-full max-w-[68ch]", className)}>
      {body}
    </div>
  );
}

// ── Plain text ──────────────────────────────────────────────────────────

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "mt-8 mb-3 text-xl font-semibold tracking-tight first:mt-0",
  2: "mt-7 mb-2.5 text-[17px] font-semibold tracking-tight first:mt-0",
  3: "mt-6 mb-2 text-[15px] font-semibold first:mt-0",
};

const HIGHLIGHT_BLOCK = "rounded-md bg-primary/10 ring-1 ring-primary/30";

function FormattedText({
  raw,
  start,
  end,
  range,
}: {
  raw: string;
  start: number;
  end: number;
  range: Range;
}) {
  const blocks = useMemo(() => formatText(raw.slice(start, end), start), [raw, start, end]);
  return (
    <div className="text-[15px] leading-7 text-ink-soft break-words">
      {blocks.map((block, i) => (
        <BlockView key={`${block.start}-${i}`} block={block} range={range} />
      ))}
    </div>
  );
}

function BlockView({ block, range }: { block: Block; range: Range }) {
  const hit = overlaps(range, block.start, block.end);
  switch (block.type) {
    case "heading": {
      const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
      return (
        <Tag className={cn("text-ink", HEADING_CLASS[block.level])}>
          <Inline text={block.text} textStart={block.textStart} range={range} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="my-4 whitespace-pre-line first:mt-0 last:mb-0">
          <Inline text={block.text} textStart={block.textStart} range={range} />
        </p>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          className={cn(
            "my-4 space-y-1.5 pl-6 first:mt-0 last:mb-0 marker:text-muted-foreground",
            block.ordered ? "list-decimal" : "list-disc"
          )}
        >
          {block.items.map((item) => (
            <li key={item.start} className="whitespace-pre-line pl-1">
              <Inline text={item.text} textStart={item.textStart} range={range} />
            </li>
          ))}
        </ListTag>
      );
    }
    case "table": {
      const [head, ...rest] = block.header ? block.rows : [null, ...block.rows];
      const cols = Math.max(...block.rows.map((r) => r.length));
      return (
        <div
          data-highlight={hit || undefined}
          className={cn("my-5 overflow-x-auto rounded-md border border-border", hit && HIGHLIGHT_BLOCK)}
        >
          <table className="w-full border-collapse text-sm leading-6">
            {head && (
              <thead className="bg-muted">
                <tr>
                  {Array.from({ length: cols }, (_, c) => (
                    <th key={c} className="border-b border-border px-3 py-2 text-left font-semibold text-ink">
                      {head[c] ? <Inline text={head[c]} /> : null}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rest.map((row, r) => (
                <tr key={r} className="border-b border-border last:border-0">
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className="px-3 py-2 align-top">
                      {row?.[c] ? <Inline text={row[c]} /> : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "quote":
      return (
        <blockquote
          data-highlight={hit || undefined}
          className={cn(
            "my-4 whitespace-pre-line border-l-2 border-border pl-4 text-muted-foreground",
            hit && HIGHLIGHT_BLOCK
          )}
        >
          <Inline text={block.text} />
        </blockquote>
      );
    case "hr":
      return <hr className="my-6 border-border" />;
  }
}

/**
 * Inline text with links, and a <mark> over the part of `range` it covers.
 * `textStart` places the text in the raw document; omit it for text that
 * doesn't map character-for-character (table cells, quotes).
 */
function Inline({
  text,
  textStart,
  range,
}: {
  text: string;
  textStart?: number;
  range?: Range;
}) {
  const segments = useMemo(() => parseInline(text), [text]);
  const local: Range =
    range && textStart != null ? [range[0] - textStart, range[1] - textStart] : null;

  return (
    <>
      {segments.map((seg, i) => {
        const hit = overlaps(local, seg.start, seg.end);
        if (seg.type === "link") {
          const link = (
            <a
              href={seg.href}
              target="_blank"
              rel="noopener noreferrer"
              title={seg.href.startsWith("mailto:") ? undefined : seg.href}
              className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
            >
              {seg.text}
            </a>
          );
          return hit ? <Mark key={i}>{link}</Mark> : <Fragment key={i}>{link}</Fragment>;
        }
        const Wrap = seg.emphasis === "strong" ? "strong" : seg.emphasis === "em" ? "em" : Fragment;
        const wrapProps = seg.emphasis === "strong" ? { className: "font-semibold text-ink" } : {};
        if (!hit || !local) return <Wrap key={i} {...wrapProps}>{seg.text}</Wrap>;
        const textOffset = seg.start + (seg.markerLen ?? 0);
        const a = Math.min(seg.text.length, Math.max(0, local[0] - textOffset));
        const b = Math.max(a, Math.min(seg.text.length, local[1] - textOffset));
        return (
          <Wrap key={i} {...wrapProps}>
            {seg.text.slice(0, a)}
            <Mark>{seg.text.slice(a, b)}</Mark>
            {seg.text.slice(b)}
          </Wrap>
        );
      })}
    </>
  );
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <mark
      data-highlight
      className="rounded-sm bg-primary/15 px-0.5 text-ink ring-1 ring-primary/30 [box-decoration-break:clone]"
    >
      {children}
    </mark>
  );
}

// ── Website pages ───────────────────────────────────────────────────────

function WebsiteView({
  raw,
  title,
  url,
  range,
}: {
  raw: string;
  title: string;
  url: string | null;
  range: Range;
}) {
  const cleaned = useMemo(() => cleanWebsiteText(raw, title, url), [raw, title, url]);
  return (
    <>
      <div className="mb-6 rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-base font-semibold leading-snug text-ink">{title}</p>
        {url && (
          <>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="size-3.5 shrink-0" />
              <span className="truncate">{hostnameOf(url)}</span>
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                View original page
              </a>
            </Button>
          </>
        )}
      </div>
      {cleaned.trim() ? (
        <FormattedText raw={cleaned} start={0} end={cleaned.length} range={range} />
      ) : (
        <p className="text-sm text-muted-foreground">No text to show for this page.</p>
      )}
    </>
  );
}

// ── Email ───────────────────────────────────────────────────────────────

function formatEmailDate(value: string | undefined): string | null {
  if (!value) return null;
  let d = parseISO(value);
  if (!isValid(d)) d = new Date(value);
  return isValid(d) ? format(d, "EEE, MMM d, yyyy 'at' h:mm a") : value;
}

/** "Jane Doe <jane@x.org>" → ["Jane Doe", "jane@x.org"]. */
function splitAddress(value: string): [string, string | null] {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (m && m[1]) return [m[1], m[2]];
  if (m) return [m[2], null];
  return [value.trim(), null];
}

function EmailHeaderCard({ headers }: { headers: EmailHeaders }) {
  const [name, address] = headers.from ? splitAddress(headers.from) : ["Unknown sender", null];
  const initial = (name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
  const date = formatEmailDate(headers.date);
  return (
    <div className="mb-6 rounded-xl border border-border bg-muted/40 p-4">
      {headers.subject && (
        <h2 className="mb-3 text-lg font-semibold leading-snug text-ink">{headers.subject}</h2>
      )}
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1 text-sm leading-6">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-ink">{name}</span>
            {address && <span className="truncate text-muted-foreground">{address}</span>}
          </div>
          {headers.to && (
            <p className="truncate text-muted-foreground" title={headers.to}>
              To: {headers.to}
            </p>
          )}
          {headers.cc && (
            <p className="truncate text-muted-foreground" title={headers.cc}>
              Cc: {headers.cc}
            </p>
          )}
          {date && <p className="text-xs text-muted-foreground">{date}</p>}
        </div>
      </div>
    </div>
  );
}

function EmailView({
  raw,
  headers,
  html,
  range,
}: {
  raw: string;
  headers: EmailHeaders;
  html: string | null;
  range: Range;
}) {
  const parsed = useMemo(() => parseEmailText(raw), [raw]);
  const split = useMemo(() => splitQuoted(parsed.body), [parsed.body]);
  const mainEnd = parsed.bodyStart + split.main.length;
  const quotedStart = split.quotedStart != null ? parsed.bodyStart + split.quotedStart : null;
  const quoteHit = quotedStart != null && overlaps(range, quotedStart, raw.length);

  // The original HTML reads best, but a cited passage can only be found in
  // the text, so open on the text when there's one to show.
  const [view, setView] = useState<SourceView>(html && !range ? "original" : "text");
  const [showQuoted, setShowQuoted] = useState(false);
  const quotedOpen = showQuoted || quoteHit;

  const fwd =
    parsed.forwarded &&
    parsed.forwarded.start >= parsed.bodyStart &&
    parsed.forwarded.end <= mainEnd
      ? parsed.forwarded
      : null;

  return (
    <>
      <EmailHeaderCard headers={headers} />

      {html && raw.trim() && <ViewToggle value={view} onChange={setView} className="mb-4" />}

      {html && (view === "original" || !raw.trim()) ? (
        <SafeEmailHtml html={html} />
      ) : !raw.trim() ? (
        <p className="text-sm text-muted-foreground">This email has no text.</p>
      ) : (
        <>
          {fwd ? (
            <>
              <FormattedText raw={raw} start={parsed.bodyStart} end={fwd.start} range={range} />
              <ForwardedCard headers={fwd.headers} />
              <FormattedText raw={raw} start={fwd.end} end={mainEnd} range={range} />
            </>
          ) : (
            <FormattedText raw={raw} start={parsed.bodyStart} end={mainEnd} range={range} />
          )}

          {quotedStart != null && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowQuoted((s) => !s)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-ink"
                aria-expanded={quotedOpen}
              >
                <ChevronDown className={cn("size-3.5 transition-transform", quotedOpen && "rotate-180")} />
                {quotedOpen ? "Hide quoted text" : "Show quoted text"}
              </button>
              {quotedOpen && (
                <div className="mt-4 border-l-2 border-border pl-4 opacity-85">
                  <FormattedText raw={raw} start={quotedStart} end={raw.length} range={range} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function ForwardedCard({ headers }: { headers: EmailHeaders }) {
  const date = formatEmailDate(headers.date);
  return (
    <div className="my-5 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm leading-6">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Forward className="size-3.5" />
        Forwarded message
      </p>
      {headers.from && <p className="text-ink">From: {headers.from}</p>}
      {headers.subject && <p className="text-ink-soft">Subject: {headers.subject}</p>}
      {date && <p className="text-xs text-muted-foreground">{date}</p>}
    </div>
  );
}

const EMAIL_CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'";

const EMAIL_FRAME_STYLE = `
  html, body { margin: 0; padding: 0; background: #fff; }
  body { padding: 16px; color: #1f2933; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow-wrap: anywhere; overflow-x: auto; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #2d6a4f; }
`;

/**
 * An email's own HTML, sanitized and shown in a sandboxed frame: no scripts,
 * forms, frames or remote resources other than https images, and links open
 * in a new tab. The frame grows to its content so the panel scrolls as one.
 */
function SafeEmailHtml({ html }: { html: string }) {
  const [doc, setDoc] = useState<string | null>(null);
  const [height, setHeight] = useState(240);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    import("dompurify").then(({ default: DOMPurify }) => {
      if (cancelled) return;
      const hook = (node: Element) => {
        if (node.tagName === "A") {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      };
      DOMPurify.addHook("afterSanitizeAttributes", hook);
      let clean: string;
      try {
        clean = DOMPurify.sanitize(html, {
          FORBID_TAGS: [
            "script", "iframe", "frame", "frameset", "object", "embed", "applet",
            "form", "input", "button", "textarea", "select", "option",
            "link", "meta", "base", "audio", "video", "source",
          ],
          FORBID_ATTR: ["action", "formaction", "srcset", "ping"],
          ALLOW_DATA_ATTR: false,
        });
      } finally {
        DOMPurify.removeHook("afterSanitizeAttributes", hook);
      }
      setDoc(
        `<!doctype html><html><head><meta charset="utf-8">` +
          `<meta http-equiv="Content-Security-Policy" content="${EMAIL_CSP}">` +
          `<meta name="viewport" content="width=device-width, initial-scale=1">` +
          `<base target="_blank"><style>${EMAIL_FRAME_STYLE}</style></head>` +
          `<body>${clean}</body></html>`
      );
    });
    return () => {
      cancelled = true;
    };
  }, [html]);

  // Size the frame to its content, again as images load. Reading the frame's
  // document needs allow-same-origin; with scripts disabled it grants the
  // content nothing.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !doc) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const body = frame.contentDocument?.body;
      const root = frame.contentDocument?.documentElement;
      if (!body || !root) return;
      setHeight(Math.max(body.scrollHeight, root.scrollHeight, 120));
    };
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
    };
    frame.addEventListener("load", onLoad);
    // The srcdoc may already have loaded before this effect ran.
    if (frame.contentDocument?.readyState === "complete" && frame.contentDocument.body?.childElementCount) {
      onLoad();
    }
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [doc]);

  if (!doc) {
    return (
      <div className="flex items-center justify-center py-12">
        <LogoSpinner size={24} />
      </div>
    );
  }

  return (
    <iframe
      ref={frameRef}
      title="Email message"
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      srcDoc={doc}
      style={{ height }}
      className="block w-full rounded-xl border border-border bg-white"
    />
  );
}
