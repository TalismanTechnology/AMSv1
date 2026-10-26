"use client";

// Scrolls to an element by id and briefly highlights it (.setting-highlight in
// globals.css). The element may not exist yet when called right after a
// navigation, so this waits for it to render, up to a few seconds.

const WAIT_MS = 4000;
const HIGHLIGHT_MS = 2400;

let pendingFrame: number | null = null;

export function highlightAnchor(id: string) {
  if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
  pendingFrame = null;
  if (!id) return;
  const start = performance.now();

  const tick = () => {
    const el = document.getElementById(id);
    // Rendered and visible (not inside a hidden, e.g. phone-only, container).
    if (el && el.getClientRects().length > 0) {
      pendingFrame = null;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("setting-highlight");
      // Restart the animation if it's already playing.
      void el.offsetWidth;
      el.classList.add("setting-highlight");
      window.setTimeout(() => el.classList.remove("setting-highlight"), HIGHLIGHT_MS);
      return;
    }
    if (performance.now() - start > WAIT_MS) {
      pendingFrame = null;
      return;
    }
    pendingFrame = requestAnimationFrame(tick);
  };
  tick();
}
