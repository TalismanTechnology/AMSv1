"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import type { MarkdownRenderer as MarkdownRendererType } from "./markdown-renderer";

// react-markdown + remark-gfm are a large share of the chat route's JS, and no
// message is on screen at first paint (history loads after mount), so the
// renderer lives in its own chunk. The fetch starts as soon as this module runs
// in the browser, so the chunk is usually ready before the first message renders.
let markdownRendererPromise: Promise<{
  default: typeof MarkdownRendererType;
}> | null = null;

// Shared by preload and React.lazy so the chunk is requested once. A failed
// load clears the cache so the next attempt can retry.
const loadMarkdownRenderer = () => {
  markdownRendererPromise ??= import("./markdown-renderer")
    .then((m) => ({ default: m.MarkdownRenderer }))
    .catch((err) => {
      markdownRendererPromise = null;
      throw err;
    });
  return markdownRendererPromise;
};

const LazyMarkdownRenderer = lazy(loadMarkdownRenderer);

export function preloadMarkdownRenderer() {
  loadMarkdownRenderer().catch(() => {});
}

if (typeof window !== "undefined") preloadMarkdownRenderer();

export function MarkdownRenderer(
  props: ComponentProps<typeof MarkdownRendererType>
) {
  return (
    // Until the chunk arrives, show the raw text in the same paragraph style
    // so the bubble keeps roughly its final size.
    <Suspense
      fallback={<p className="mb-2 last:mb-0 whitespace-pre-wrap">{props.content}</p>}
    >
      <LazyMarkdownRenderer {...props} />
    </Suspense>
  );
}
