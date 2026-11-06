import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { act, useActionState, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { SubmitButton } from "@/components/ui/submit-button";
import { LogoLoading } from "@/components/logo-loading";

// React 19's <form action={fn}> runs `fn` inside an async transition, so plain
// `setState(true)` inside `fn` stays buffered until `fn` finishes — leaving the
// user with no spinner while `login()` runs and redirects. `useActionState` and
// `useFormStatus` (`SubmitButton`) commit their pending state immediately.
test("useActionState + SubmitButton show pending feedback while login() is in flight", async () => {
  const { window, document } = parseHTML("<!doctype html><html><body><div id='root'></div></body></html>");
  const formProto = Object.getPrototypeOf(document.createElement("form")) as { reset?: (this: HTMLFormElement) => void };
  if (!formProto.reset) {
    formProto.reset = function (this: HTMLFormElement) {
      for (const el of this.querySelectorAll("input") as Iterable<HTMLInputElement>) {
        el.value = el.getAttribute("value") ?? "";
      }
    };
  }
  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevFormData = globalThis.FormData;
  const prevActEnv = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;

  class DomFormData extends prevFormData {
    constructor(form?: HTMLFormElement) {
      super();
      if (form && typeof form.querySelectorAll === "function") {
        for (const el of form.querySelectorAll("input, textarea, select") as Iterable<HTMLInputElement>) {
          if (el.name) this.append(el.name, el.value ?? "");
        }
      }
    }
  }

  (globalThis as unknown as { window: unknown }).window = Object.assign(window, {
    matchMedia: () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  (globalThis as unknown as { document: unknown }).document = document;
  (globalThis as unknown as { FormData: unknown }).FormData = DomFormData;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  try {
    let resolveLogin!: (value: { error?: string } | undefined) => void;
    const fakeLogin = () =>
      new Promise<{ error?: string } | undefined>((resolve) => {
        resolveLogin = resolve;
      });

    function Harness() {
      const [email, setEmail] = useState("staff@collegiate.org");
      const [error, formAction, pending] = useActionState(
        async () => {
          const result = await fakeLogin();
          return result?.error ?? null;
        },
        null
      );
      return (
        <div>
          {pending && <LogoLoading label="Signing you in…" />}
          {!pending && error && <div role="alert">{error}</div>}
          <form action={formAction}>
            <input
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
          </form>
        </div>
      );
    }

    const container = document.getElementById("root")!;
    const root = createRoot(container as unknown as Element);

    await act(async () => {
      root.render(<Harness />);
    });

    const button = () => container.querySelector("button")!;
    assert.match(button().textContent ?? "", /Sign in/);
    assert.equal(container.querySelector('[role="status"]'), null);

    // Submit the form: `fakeLogin` has NOT resolved yet, and both the button
    // ("Signing in…") and full-screen status ("Signing you in…") must already
    // be visible in the DOM.
    await act(async () => {
      const form = container.querySelector("form")!;
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });

    assert.match(button().textContent ?? "", /Signing in…/);
    assert.equal(button().hasAttribute("disabled"), true);
    const status = container.querySelector('[role="status"]');
    assert.ok(status, "LogoLoading overlay should render while login() is in flight");
    assert.match(status.textContent ?? "", /Signing you in…/);

    // Finishing with an error clears the pending state, shows the alert, and
    // preserves the controlled email value.
    await act(async () => {
      resolveLogin({ error: "Invalid login credentials" });
    });

    assert.match(button().textContent ?? "", /Sign in/);
    assert.equal(container.querySelector('[role="status"]'), null);
    assert.equal(container.querySelector('[role="alert"]')?.textContent, "Invalid login credentials");
    assert.equal((container.querySelector('input[name="email"]') as HTMLInputElement).value, "staff@collegiate.org");

    await act(async () => {
      root.unmount();
    });
  } finally {
    (globalThis as unknown as { window: unknown }).window = prevWindow;
    (globalThis as unknown as { document: unknown }).document = prevDocument;
    (globalThis as unknown as { FormData: unknown }).FormData = prevFormData;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = prevActEnv;
  }
});

test("staff and school password login forms use useActionState + SubmitButton", () => {
  const root = process.cwd();
  for (const rel of [
    "app/login/staff/staff-login-form.tsx",
    "app/s/[slug]/(auth)/login/login-form.tsx",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.match(src, /useActionState/, `${rel} must track form action pending via useActionState`);
    assert.match(src, /<SubmitButton[\s\S]*pendingText="Signing in…"/, `${rel} must use SubmitButton`);
    assert.doesNotMatch(src, /setLoading\(true\);\s*setError\(null\);\s*const result = await login/, `${rel} must not set loading inside a <form action> transition`);
  }
});
