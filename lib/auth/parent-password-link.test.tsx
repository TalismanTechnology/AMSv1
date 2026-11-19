import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import {
  PARENT_PASSWORD_LINK_LABEL,
  staffPasswordForm,
  staffSignInMode,
  type StaffSignInMode,
} from "./admin-google-only";

// With ADMIN_GOOGLE_ONLY on, the staff sign-in forms still let a parent whose
// account allows a password (parent_password_login, e.g. the App Review demo
// login) reach the password form, behind a quiet link. Rendered for real
// (linkedom) so the link is shown to be clickable, not just present.

// ─── module stand-ins (no Next.js runtime under node:test) ────────────

function stub(request: string, exports: Record<string, unknown>) {
  const resolved = request.startsWith("@/")
    ? require.resolve(path.join(process.cwd(), request.slice(2)))
    : require.resolve(request);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports } as unknown as NodeModule;
}

stub("next/navigation", {
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} }),
  usePathname: () => "/login/staff",
});
stub("next/link", {
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
});
stub("@/actions/auth", { login: async () => ({ error: "stubbed" }) });

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
    passwordInput: () => container.querySelector('input[type="password"]'),
    parentLink: () => container.querySelector("[data-parent-password-link]"),
    googleButton: () => container.querySelector("[data-google-sign-in]"),
    buttonByText: (text: string) =>
      [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) ?? null,
    click: async (element: Element | null) => {
      assert.ok(element, "element to click");
      await act(async () => {
        element.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
      });
    },
    unmount: () => act(async () => root.unmount()),
  };
}

// ─── mode → form ──────────────────────────────────────────────────────

test("the password form is open unless ADMIN_GOOGLE_ONLY is on, then it's a parent link", () => {
  assert.equal(staffPasswordForm("password"), "open");
  assert.equal(staffPasswordForm("google-and-password"), "open");
  assert.equal(staffPasswordForm("google-only"), "parent-link");
  assert.equal(staffPasswordForm("unavailable"), "parent-link");
  // Flags off: today's password-only staff form.
  assert.equal(staffPasswordForm(staffSignInMode({})), "open");
  assert.equal(
    staffPasswordForm(staffSignInMode({ GOOGLE_SIGNIN_ENABLED: "true", ADMIN_GOOGLE_ONLY: "true" })),
    "parent-link"
  );
  assert.doesNotMatch(PARENT_PASSWORD_LINK_LABEL, /admin/i);
});

// ─── /login/staff ─────────────────────────────────────────────────────

async function staffPage(mode: StaffSignInMode) {
  const { StaffLoginForm } = await import("@/app/login/staff/staff-login-form");
  return render(<StaffLoginForm mode={mode} />);
}

test("/login/staff google-only: Google for admins, a link opens the parent password form", async () => {
  const page = await staffPage("google-only");
  assert.ok(page.googleButton());
  assert.match(page.container.textContent ?? "", /Admins sign in with Google\./);
  assert.equal(page.passwordInput(), null);
  assert.equal(page.parentLink()?.textContent, PARENT_PASSWORD_LINK_LABEL);

  await page.click(page.parentLink());
  assert.ok(page.passwordInput(), "password form after the parent link");
  assert.ok(page.container.querySelector('input[name="email"]'));
  assert.match(page.container.textContent ?? "", /For parent accounts that have an AskMySchool password/);
  assert.equal(page.parentLink()?.getAttribute("aria-expanded"), "true");
  await page.unmount();
});

test("/login/staff unavailable (Google off): parents can still reach the password form", async () => {
  const page = await staffPage("unavailable");
  assert.equal(page.googleButton(), null);
  assert.equal(page.passwordInput(), null);
  await page.click(page.parentLink());
  assert.ok(page.passwordInput());
  await page.unmount();
});

test("/login/staff flags off: the password form is shown as before, no parent link", async () => {
  for (const mode of ["password", "google-and-password"] as const) {
    const page = await staffPage(mode);
    assert.ok(page.passwordInput(), mode);
    assert.equal(page.parentLink(), null, mode);
    assert.equal(Boolean(page.googleButton()), mode === "google-and-password", mode);
    await page.unmount();
  }
});

// ─── /s/<slug>/login ──────────────────────────────────────────────────

async function schoolPage(staffSignIn: StaffSignInMode) {
  const { LoginForm } = await import("@/app/s/[slug]/(auth)/login/login-form");
  return render(
    <LoginForm
      schoolSlug="collegiate"
      schoolId="44444444-4444-4444-8444-444444444444"
      schoolName="Collegiate"
      provider="blackbaud"
      signInEnabled
      staffSignIn={staffSignIn}
    />
  );
}

test("school login google-only: School staff sign-in → parent link → password form for that school", async () => {
  const page = await schoolPage("google-only");
  // Parent section first, as always.
  assert.equal(page.passwordInput(), null);
  assert.equal(page.parentLink(), null);

  await page.click(page.buttonByText("School staff sign-in"));
  assert.ok(page.googleButton());
  assert.equal(page.passwordInput(), null);

  await page.click(page.parentLink());
  assert.ok(page.passwordInput());
  // Posts the school, so login() checks the parent membership here.
  assert.equal(
    (page.container.querySelector('input[name="school_slug"]') as HTMLInputElement | null)?.value,
    "collegiate"
  );
  await page.unmount();
});

test("school login flags off: the staff section shows the password form as before", async () => {
  const page = await schoolPage("password");
  await page.click(page.buttonByText("School staff sign-in"));
  assert.ok(page.passwordInput());
  assert.equal(page.parentLink(), null);
  assert.equal(page.googleButton(), null);
  await page.unmount();
});
