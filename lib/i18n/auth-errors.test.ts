import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { localizeAuthError, schoolPossessiveFor } from "./auth-errors";
import { en, es } from "./messages";
import { GOOGLE_MESSAGES } from "../auth/google-sign-in";
import {
  ADMIN_GOOGLE_ONLY_MESSAGE,
  ADMIN_SIGN_IN_UNAVAILABLE_MESSAGE,
  PARENT_PASSWORD_FORM_NOTE,
  PARENT_PASSWORD_LINK_LABEL,
} from "../auth/admin-google-only";
import { rosterGateMessage } from "../roster/gate";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

/** The string literals of a route file's `const MESSAGES = { … }`. */
function routeMessages(file: string): string[] {
  const block = read(file).match(/const MESSAGES = \{([\s\S]*?)\} as const;/)?.[1] ?? "";
  return [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

test("English (and unknown messages) come back unchanged", () => {
  assert.equal(localizeAuthError("Invalid login credentials", "en"), "Invalid login credentials");
  assert.equal(localizeAuthError("Something new went wrong", "es"), "Something new went wrong");
  assert.equal(localizeAuthError("", "es"), "");
});

test("known messages are translated to Spanish", () => {
  assert.equal(
    localizeAuthError("Invalid login credentials", "es"),
    "Correo electrónico o contraseña incorrectos."
  );
  assert.equal(
    localizeAuthError("Blackbaud sign-in was cancelled.", "es"),
    "Se canceló el inicio de sesión con Blackbaud."
  );
  assert.equal(
    localizeAuthError(ADMIN_GOOGLE_ONLY_MESSAGE, "es"),
    es["auth.error.adminGoogleOnly"]
  );
});

test("messages with a school name keep the name", () => {
  assert.equal(
    localizeAuthError("Collegiate hasn't turned on Veracross sign-in yet. Please check back soon.", "es"),
    "Collegiate aún no ha activado el inicio de sesión con Veracross. Vuelva a intentarlo pronto."
  );
  assert.equal(
    localizeAuthError(rosterGateMessage("St. James"), "es"),
    "Su correo electrónico aún no figura en la lista de padres de St. James para AskMySchool. Comuníquese con la oficina de la escuela."
  );
});

test("every message the sign-in callbacks and actions send has a Spanish version", () => {
  const messages = [
    ...Object.values(GOOGLE_MESSAGES),
    ADMIN_GOOGLE_ONLY_MESSAGE,
    ...routeMessages("app/auth/blackbaud/callback/route.ts"),
    ...routeMessages("app/auth/veracross/callback/route.ts"),
    "We couldn't find that school.",
    "Sign-in is temporarily unavailable. Please try again later.",
    "We couldn't finish signing you in. Please try again.",
    "You do not have access to this school.",
    "You're not a staff member at this school.",
    "Login failed",
    "Name is required",
    "Invalid grade",
    "Could not save your children. Please try again.",
  ];
  assert.ok(messages.length > 20);
  for (const message of messages) {
    const spanish = localizeAuthError(message, "es");
    assert.notEqual(spanish, message, `no Spanish for: ${message}`);
  }
  // The parent-password error in actions/auth.ts, curly quotes included.
  const parentPassword = read("actions/auth.ts").match(/const PARENT_PASSWORD_ERROR =\s*"([^"]+)";/)?.[1];
  assert.ok(parentPassword);
  assert.equal(localizeAuthError(parentPassword, "es"), es["auth.error.parentPassword"]);
});

test("the English dictionary matches the constants the sign-in tests import", () => {
  assert.equal(en["auth.parentPasswordLink"], PARENT_PASSWORD_LINK_LABEL);
  assert.equal(en["auth.parentPasswordNote"], PARENT_PASSWORD_FORM_NOTE);
  assert.equal(en["auth.adminSignInUnavailable"], ADMIN_SIGN_IN_UNAVAILABLE_MESSAGE);
  assert.equal(en["auth.error.adminGoogleOnly"], ADMIN_GOOGLE_ONLY_MESSAGE);
});

test("schoolPossessiveFor: English possessive, Spanish plain name", () => {
  assert.equal(schoolPossessiveFor("en", "Collegiate"), "Collegiate's");
  assert.equal(schoolPossessiveFor("en", "St. James"), "St. James'");
  assert.equal(schoolPossessiveFor("en", null), "your school's");
  assert.equal(schoolPossessiveFor("es", "Collegiate"), "Collegiate");
  assert.equal(schoolPossessiveFor("es", "  "), "su escuela");
});
