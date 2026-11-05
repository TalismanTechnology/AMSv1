import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ChatInterface } from "@/components/chat/chat-interface";
import { SuggestedQuestions } from "@/components/chat/suggested-questions";
import {
  APP_VIEWPORT_CLASS,
  KEYBOARD_OPEN_ATTRIBUTE,
  VIEWPORT_HEIGHT_VAR,
  VIEWPORT_TOP_VAR,
  keyboardViewport,
  trackKeyboardViewport,
  type ViewportWindow,
} from "./keyboard";

// iPhone 14-ish: 844pt screen, web view below the status bar (47pt), and a
// 336pt keyboard with its suggestion bar.
const PHONE = 797;
const KEYBOARD = 336;

test("keyboard closed: nothing is pinned", () => {
  assert.deepEqual(
    keyboardViewport({ layoutHeight: PHONE, visualHeight: PHONE, offsetTop: 0, scale: 1 }),
    { keyboardOpen: false }
  );
});

test("Safari toolbar collapsing is not a keyboard", () => {
  assert.equal(
    keyboardViewport({ layoutHeight: PHONE, visualHeight: PHONE - 80, offsetTop: 0, scale: 1 })
      .keyboardOpen,
    false
  );
});

test("keyboard open: the shell is the visible area above it", () => {
  assert.deepEqual(
    keyboardViewport({
      layoutHeight: PHONE,
      visualHeight: PHONE - KEYBOARD,
      offsetTop: 0,
      scale: 1,
    }),
    { keyboardOpen: true, height: PHONE - KEYBOARD, top: 0 }
  );
});

test("iOS panning the page up to the input: the shell follows the visible area", () => {
  // The bug: iOS scrolls the visual viewport down by the keyboard height, so
  // an unpinned full-height shell has its header off the top of the screen.
  assert.deepEqual(
    keyboardViewport({
      layoutHeight: PHONE,
      visualHeight: PHONE - KEYBOARD,
      offsetTop: KEYBOARD,
      scale: 1,
    }),
    { keyboardOpen: true, height: PHONE - KEYBOARD, top: KEYBOARD }
  );
  // Rubber-band overscroll can report a negative offset.
  const bounced = keyboardViewport({
    layoutHeight: PHONE,
    visualHeight: PHONE - KEYBOARD,
    offsetTop: -12.4,
    scale: 1,
  });
  assert.equal(bounced.keyboardOpen && bounced.top, 0);
});

test("pinch zoom without a keyboard is not a keyboard", () => {
  assert.equal(
    keyboardViewport({ layoutHeight: PHONE, visualHeight: PHONE / 2, offsetTop: 200, scale: 2 })
      .keyboardOpen,
    false
  );
});

test("desktop and Android (layout viewport resizes itself): never pinned", () => {
  assert.equal(
    keyboardViewport({ layoutHeight: 900, visualHeight: 900, offsetTop: 0, scale: 1 })
      .keyboardOpen,
    false
  );
  // Android's web view shrinks both together when its keyboard opens.
  assert.equal(
    keyboardViewport({ layoutHeight: 480, visualHeight: 480, offsetTop: 0, scale: 1 })
      .keyboardOpen,
    false
  );
});

/** A window whose visual viewport can be driven like iOS's. */
function fakeWindow(layoutHeight: number) {
  const listeners = new Map<string, Set<() => void>>();
  const attributes = new Map<string, string>();
  const vars = new Map<string, string>();
  const vv = {
    height: layoutHeight,
    offsetTop: 0,
    scale: 1,
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
  };
  const win: ViewportWindow = {
    visualViewport: vv,
    document: {
      documentElement: {
        clientHeight: layoutHeight,
        setAttribute: (name, value) => void attributes.set(name, value),
        removeAttribute: (name) => void attributes.delete(name),
        style: {
          setProperty: (name, value) => void vars.set(name, value),
          removeProperty: (name) => void vars.delete(name),
        },
      },
    },
  };
  const fire = (type: "resize" | "scroll") => listeners.get(type)?.forEach((fn) => fn());
  return {
    win,
    vv,
    attributes,
    vars,
    fire,
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    /** Focus the composer: iOS pans first, then the keyboard finishes resizing. */
    openKeyboard() {
      vv.offsetTop = KEYBOARD;
      fire("scroll");
      vv.height = layoutHeight - KEYBOARD;
      fire("resize");
    },
    /** The parent drags the page back down while the keyboard stays up. */
    scrollBack() {
      vv.offsetTop = 0;
      fire("scroll");
    },
    closeKeyboard() {
      vv.height = layoutHeight;
      vv.offsetTop = 0;
      fire("resize");
    },
    type() {
      // Typing doesn't move the viewport; no events.
    },
  };
}

test("tracker: open, pan, type, close, reopen", () => {
  const w = fakeWindow(PHONE);
  const stop = trackKeyboardViewport(w.win);
  assert.equal(w.attributes.size, 0, "closed on mount");
  assert.equal(w.vars.size, 0);

  w.openKeyboard();
  assert.equal(w.attributes.get(KEYBOARD_OPEN_ATTRIBUTE), "open");
  assert.equal(w.vars.get(VIEWPORT_HEIGHT_VAR), `${PHONE - KEYBOARD}px`);
  assert.equal(w.vars.get(VIEWPORT_TOP_VAR), `${KEYBOARD}px`);

  w.type();
  assert.equal(w.vars.get(VIEWPORT_HEIGHT_VAR), `${PHONE - KEYBOARD}px`);

  w.scrollBack();
  assert.equal(w.vars.get(VIEWPORT_TOP_VAR), "0px", "header and composer both stay visible");
  assert.equal(w.vars.get(VIEWPORT_HEIGHT_VAR), `${PHONE - KEYBOARD}px`);

  w.closeKeyboard();
  assert.equal(w.attributes.size, 0, "keyboard-closed layout is untouched");
  assert.equal(w.vars.size, 0);

  w.openKeyboard();
  assert.equal(w.attributes.get(KEYBOARD_OPEN_ATTRIBUTE), "open");

  stop();
  assert.equal(w.listenerCount(), 0);
  assert.equal(w.attributes.size, 0, "cleanup leaves <html> as it was");
  assert.equal(w.vars.size, 0);
});

test("tracker: mounted with the keyboard already open", () => {
  const w = fakeWindow(PHONE);
  w.vv.height = PHONE - KEYBOARD;
  trackKeyboardViewport(w.win);
  assert.equal(w.attributes.get(KEYBOARD_OPEN_ATTRIBUTE), "open");
  assert.equal(w.vars.get(VIEWPORT_HEIGHT_VAR), `${PHONE - KEYBOARD}px`);
});

test("tracker: resizing a desktop window never pins the shell", () => {
  const w = fakeWindow(900);
  trackKeyboardViewport(w.win);
  // Both viewports shrink together.
  w.win.document.documentElement.clientHeight = 600;
  w.vv.height = 600;
  w.fire("resize");
  assert.equal(w.attributes.size, 0);
  assert.equal(w.vars.size, 0);
});

test("tracker: no visualViewport is a no-op", () => {
  const w = fakeWindow(PHONE);
  w.win.visualViewport = undefined;
  const stop = trackKeyboardViewport(w.win);
  stop();
  assert.equal(w.attributes.size, 0);
});

async function tailwindCss(classes: string[]): Promise<string> {
  const dir = join(process.cwd(), "node_modules/tailwindcss");
  const compiler = await compile('@import "tailwindcss";', {
    base: process.cwd(),
    loadStylesheet: async (id, base) => ({
      path: id,
      base,
      content: readFileSync(
        join(dir, id === "tailwindcss" ? "index.css" : id.replace(/^tailwindcss\//, "")),
        "utf8"
      ),
    }),
  });
  return compiler.build(classes);
}

/** The declarations Tailwind emits for one class. */
function rule(css: string, className: string): string {
  const escaped = className.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  const start = css.indexOf(`.${escaped} {`);
  assert.notEqual(start, -1, `no CSS for ${className}`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return css.slice(start);
}

test("shell CSS: full height closed; fixed to the visual viewport while open", async () => {
  const classes = APP_VIEWPORT_CLASS.split(" ");
  assert.ok(classes.includes("flex") && classes.includes("h-dvh"), "keyboard-closed layout unchanged");
  const css = await tailwindCss(classes);
  assert.match(rule(css, "h-dvh"), /height: 100dvh/);
  const open = (c: string) => rule(css, `[[data-keyboard=open]_&]:${c}`);
  assert.match(open("fixed"), /\[data-keyboard=open\] & \{\s*position: fixed/);
  assert.match(open("inset-x-0"), /inset-inline:/);
  assert.match(open("top-[var(--visual-viewport-top)]"), /top: var\(--visual-viewport-top\)/);
  assert.match(
    open("h-[var(--visual-viewport-height)]"),
    /height: var\(--visual-viewport-height\)/
  );
});

test("the parent layout uses the pinned shell and mounts the tracker", () => {
  const layout = readFileSync(
    join(process.cwd(), "app/s/[slug]/(dashboard)/parent/layout.tsx"),
    "utf8"
  );
  assert.match(layout, /className=\{APP_VIEWPORT_CLASS\}/);
  assert.match(layout, /<KeyboardViewport \/>/);
  assert.doesNotMatch(layout, /"flex h-dvh"/);
});

test("empty state: roomy when closed, compact while the keyboard is open", () => {
  const html = renderToStaticMarkup(<SuggestedQuestions onSelect={() => {}} />);
  assert.match(html, /class="[^"]*\bpy-20\b[^"]*\[\[data-keyboard=open\]_&amp;\]:py-4/);
  assert.match(html, /Ask about your school/);
  assert.equal(html.match(/<button/g)?.length, 3);
});

function renderChat() {
  const router = {
    push() {},
    replace() {},
    refresh() {},
    back() {},
    forward() {},
    prefetch() {},
  } as never;
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathParamsContext.Provider value={{ slug: "demo" }}>
        <ChatInterface sessionId={null} />
      </PathParamsContext.Provider>
    </AppRouterContext.Provider>
  );
}

test("chat: only the message list scrolls; the composer drops onto the keyboard", () => {
  const html = renderChat();
  // The scroll container (shared by the empty state and a conversation).
  assert.match(html, /class="flex-1 overflow-y-auto px-4 flex flex-col"/);
  assert.match(html, /pb-32/, "the last message still clears the composer");
  const composer = html.match(/<div class="(pointer-events-none absolute[^"]*)"/)?.[1] ?? "";
  // Keyboard closed: as before, clear of the home indicator.
  assert.match(composer, /\bbottom-6\b/);
  assert.match(composer, /pb-\[calc\(1rem_\+_env\(safe-area-inset-bottom\)\)\]/);
  // Keyboard open: right above it.
  assert.match(composer, /\[\[data-keyboard=open\]_&amp;\]:bottom-0/);
  assert.match(composer, /\[\[data-keyboard=open\]_&amp;\]:pb-2/);
  assert.match(html, /<textarea[^>]*placeholder="Ask a question about your school…"/);
});

test("composer CSS only changes under the keyboard attribute", async () => {
  const css = await tailwindCss([
    "bottom-6",
    "[[data-keyboard=open]_&]:bottom-0",
    "[[data-keyboard=open]_&]:pb-2",
    "[[data-keyboard=open]_&]:py-4",
  ]);
  assert.match(rule(css, "[[data-keyboard=open]_&]:bottom-0"), /\[data-keyboard=open\] & \{\s*bottom:/);
  assert.match(rule(css, "[[data-keyboard=open]_&]:pb-2"), /\[data-keyboard=open\] & \{\s*padding-bottom:/);
  assert.match(rule(css, "[[data-keyboard=open]_&]:py-4"), /\[data-keyboard=open\] & \{\s*padding-block:/);
  assert.doesNotMatch(rule(css, "bottom-6"), /data-keyboard/);
});
