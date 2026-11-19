import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import type { AuthProvider } from "./provider";

// The emailed one-time-code parent sign-in ("roster" as a parent sign-in
// provider) was removed. Rendered for real (linkedom): the school login page
// never offers a code form, a leftover auth_provider = 'roster' tells parents
// to contact the school, and admin settings no longer offer "Email code".

// ─── module stand-ins (no Next.js runtime under node:test) ────────────

function stub(request: string, exports: Record<string, unknown>) {
  const resolved = request.startsWith("@/")
    ? require.resolve(path.join(process.cwd(), request.slice(2)))
    : require.resolve(request);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports } as unknown as NodeModule;
}

const providerUpdates: string[] = [];

stub("next/navigation", {
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} }),
  usePathname: () => "/s/collegiate/login",
});
stub("next/link", {
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
});
// Radix's switch needs DOM setters linkedom doesn't have.
stub("@/components/ui/switch", {
  Switch: ({ id, checked }: { id?: string; checked?: boolean }) =>
    React.createElement("input", { type: "checkbox", role: "switch", id, checked, readOnly: true }),
});
stub("@/actions/auth", { login: async () => ({ error: "stubbed" }) });
stub("@/actions/parent-sign-in", {
  updateParentSignInProvider: async (_schoolId: string, provider: string) => {
    providerUpdates.push(provider);
    return { success: true };
  },
  uploadRoster: async () => ({}),
  previewRosterUpload: async () => ({}),
  updateRequireRosterMatch: async () => ({}),
});

// ─── DOM ──────────────────────────────────────────────────────────────

const { window, document } = parseHTML("<!doctype html><html><body><div id='root'></div></body></html>");
Object.assign(globalThis, {
  window: Object.assign(window, {
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  }),
  document,
  IS_REACT_ACT_ENVIRONMENT: true,
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => root.render(element));
  return {
    container,
    text: () => container.textContent ?? "",
    unmount: () => act(async () => root.unmount()),
  };
}

const EMAIL_CODE_COPY = /email me a code|sign-in code|6-digit|code sent to your email|email code|enter (the|your) code/i;

// ─── /s/<slug>/login ──────────────────────────────────────────────────

async function schoolPage(provider: AuthProvider, signInEnabled: boolean) {
  const { LoginForm } = await import("@/app/s/[slug]/(auth)/login/login-form");
  return render(
    <LoginForm
      schoolSlug="collegiate"
      schoolId="44444444-4444-4444-8444-444444444444"
      schoolName="Collegiate"
      provider={provider}
      signInEnabled={signInEnabled}
      staffSignIn="password"
    />
  );
}

for (const [provider, label, href] of [
  ["blackbaud", "Blackbaud", "/auth/blackbaud?school=collegiate"],
  ["veracross", "Veracross", "/auth/veracross?school=collegiate"],
] as const) {
  test(`${label} school login: the provider button, no email-code form`, async () => {
    const page = await schoolPage(provider, true);
    const link = page.container.querySelector(`a[href="${href}"]`);
    assert.ok(link, "provider sign-in link");
    assert.match(link.textContent ?? "", new RegExp(`Sign in with ${label}`));
    assert.equal(page.container.querySelector("input"), null, "no inputs in the parent section");
    assert.equal(page.container.querySelector("form"), null);
    assert.doesNotMatch(page.text(), EMAIL_CODE_COPY);
    await page.unmount();
  });
}

test("leftover auth_provider='roster': no code form, no sign-in link, contact the school", async () => {
  // getSchoolSignIn reports roster as disabled, but even a stale enabled flag
  // must not bring a form back.
  for (const signInEnabled of [false, true]) {
    const page = await schoolPage("roster", signInEnabled);
    assert.equal(page.container.querySelector("input"), null, `no inputs (enabled=${signInEnabled})`);
    assert.equal(page.container.querySelector("form"), null);
    assert.equal(page.container.querySelector('a[href^="/auth/"]'), null);
    assert.equal(page.container.querySelector('a[href="/s/collegiate/login"]'), null);
    assert.doesNotMatch(page.text(), EMAIL_CODE_COPY);
    assert.match(page.text(), /Please contact the school/);
    // Staff sign-in still works on that page.
    assert.match(page.text(), /School staff sign-in/);
    await page.unmount();
  }
});

// ─── admin settings → Parent sign-in ──────────────────────────────────

async function settings(provider: AuthProvider) {
  const { ParentSignInSettings } = await import("@/components/admin/parent-sign-in-settings");
  return render(
    <ParentSignInSettings
      schoolId="44444444-4444-4444-8444-444444444444"
      isSuperAdmin
      config={{
        installed: true,
        loadError: null,
        provider,
        veracrossAvailable: true,
        rosterActiveCount: 12,
        rosterUpdatedAt: null,
        requireRosterMatch: false,
      }}
    />
  );
}

function providerInputs(container: Element) {
  return [...container.querySelectorAll('input[name="parent-sign-in-provider"]')] as HTMLInputElement[];
}

function providerRadios(container: Element) {
  return providerInputs(container).map((input) => input.value);
}

function checkedProvider(container: Element) {
  return providerInputs(container).find((input) => input.checked)?.value ?? null;
}

test("admin settings offer only Blackbaud and Veracross, never Email code", async () => {
  const page = await settings("blackbaud");
  assert.deepEqual(providerRadios(page.container), ["blackbaud", "veracross"]);
  assert.equal(checkedProvider(page.container), "blackbaud");
  assert.doesNotMatch(page.text(), EMAIL_CODE_COPY);
  // The roster upload and the require-roster-match gate are still there.
  assert.match(page.text(), /Parent roster/);
  assert.match(page.text(), /Require roster match for every sign-in/);
  await page.unmount();
});

test("admin settings for a leftover roster school flag it and offer a working provider", async () => {
  const page = await settings("roster");
  assert.deepEqual(providerRadios(page.container), ["blackbaud", "veracross"]);
  assert.equal(checkedProvider(page.container), null, "nothing is selected for a retired provider");
  assert.match(page.text(), /email-code sign-in, which has been removed/);
  await page.unmount();
});

test("the server action refuses 'roster'", async () => {
  const source = readFileSync(path.join(process.cwd(), "actions/parent-sign-in.ts"), "utf8");
  assert.match(source, /if \(!isSelectableAuthProvider\(provider\)\) return \{ error: "Unknown sign-in method\." \};/);
  assert.doesNotMatch(source, /"roster"/);
});

// ─── the flow itself is gone ──────────────────────────────────────────

test("the email-code request/verify code and its UI no longer exist", () => {
  for (const file of [
    "actions/roster-sign-in.ts",
    "components/auth/roster-sign-in-form.tsx",
    "lib/roster/login-code.ts",
    "lib/roster/login-code-store.ts",
    "lib/roster/login-email.ts",
  ]) {
    assert.equal(existsSync(path.join(process.cwd(), file)), false, file);
  }
});
