// The on-screen keyboard on iOS (Safari and the app's WKWebView) doesn't
// shrink the layout viewport, so `100dvh` stays full-screen height. iOS
// overlays the keyboard and instead pans the visual viewport up to keep the
// focused input visible, which scrolls the whole app shell: the header and
// the top of the page slide off the top of the screen, and scrolling back
// puts the composer under the keyboard.
//
// While the keyboard is open, the parent shell is therefore pinned (fixed) to
// exactly the visible area — window.visualViewport's height and offset —
// so the header stays at the top, the composer sits just above the keyboard,
// and only the chat's own message list scrolls. With the keyboard closed
// nothing is set and the shell is the ordinary `h-dvh`.
//
// Android's web view resizes the layout viewport itself, so there the visual
// viewport never falls short and this stays off.

/** Set on <html> while the keyboard is open. */
export const KEYBOARD_OPEN_ATTRIBUTE = "data-keyboard";
/** The visible height and its offset from the top of the layout viewport. */
export const VIEWPORT_HEIGHT_VAR = "--visual-viewport-height";
export const VIEWPORT_TOP_VAR = "--visual-viewport-top";

/**
 * A shortfall smaller than this is browser chrome (Safari's toolbar
 * collapsing), not a keyboard. The smallest iOS keyboards are ~200px.
 */
export const KEYBOARD_MIN_HEIGHT = 120;

/**
 * The parent shell: full height normally; pinned to the visual viewport while
 * the keyboard is open.
 */
export const APP_VIEWPORT_CLASS =
  "flex h-dvh [[data-keyboard=open]_&]:fixed [[data-keyboard=open]_&]:inset-x-0 [[data-keyboard=open]_&]:top-[var(--visual-viewport-top)] [[data-keyboard=open]_&]:h-[var(--visual-viewport-height)]";

export interface ViewportMetrics {
  /** Layout viewport height (documentElement.clientHeight). */
  layoutHeight: number;
  /** visualViewport.height, in CSS pixels at the current zoom. */
  visualHeight: number;
  /** visualViewport.offsetTop: how far iOS has panned the visible area down. */
  offsetTop: number;
  /** visualViewport.scale (pinch zoom). */
  scale: number;
}

export type KeyboardViewport =
  | { keyboardOpen: false }
  | { keyboardOpen: true; height: number; top: number };

export function keyboardViewport(m: ViewportMetrics): KeyboardViewport {
  // Pinch zoom shrinks visualViewport.height too; compare at scale 1.
  const covered = m.layoutHeight - m.visualHeight * (m.scale || 1);
  if (covered < KEYBOARD_MIN_HEIGHT) return { keyboardOpen: false };
  return {
    keyboardOpen: true,
    height: Math.round(m.visualHeight),
    top: Math.max(0, Math.round(m.offsetTop)),
  };
}

/** The parts of `window` the tracker reads; injectable for tests. */
export interface ViewportWindow {
  visualViewport?: {
    height: number;
    offsetTop: number;
    scale: number;
    addEventListener(type: "resize" | "scroll", listener: () => void): void;
    removeEventListener(type: "resize" | "scroll", listener: () => void): void;
  } | null;
  document: {
    documentElement: {
      clientHeight: number;
      setAttribute(name: string, value: string): void;
      removeAttribute(name: string): void;
      style: {
        setProperty(name: string, value: string): void;
        removeProperty(name: string): void;
      };
    };
  };
}

/**
 * Keeps <html>'s keyboard attribute and visual-viewport variables in step
 * with the keyboard. Returns the cleanup. A no-op without visualViewport.
 */
export function trackKeyboardViewport(win: ViewportWindow): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => {};
  const root = win.document.documentElement;

  const clear = () => {
    root.removeAttribute(KEYBOARD_OPEN_ATTRIBUTE);
    root.style.removeProperty(VIEWPORT_HEIGHT_VAR);
    root.style.removeProperty(VIEWPORT_TOP_VAR);
  };

  const update = () => {
    const state = keyboardViewport({
      layoutHeight: root.clientHeight,
      visualHeight: vv.height,
      offsetTop: vv.offsetTop,
      scale: vv.scale,
    });
    if (!state.keyboardOpen) return clear();
    root.style.setProperty(VIEWPORT_HEIGHT_VAR, `${state.height}px`);
    root.style.setProperty(VIEWPORT_TOP_VAR, `${state.top}px`);
    root.setAttribute(KEYBOARD_OPEN_ATTRIBUTE, "open");
  };

  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  return () => {
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
    clear();
  };
}
