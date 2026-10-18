import { createPkcePair } from "@/lib/blackbaud/parent-login";
import { createVeracrossLoginState, packLoginCookie } from "@/lib/blackbaud/state";
import type { VeracrossConnection } from "./connection";
import {
  buildVeracrossAuthorizeUrl,
  decideVeracrossParentAccess,
  exchangeVeracrossCode,
  fetchVeracrossUser,
  getVeracrossRedirectUri,
  type VeracrossAccessDecision,
  type VeracrossUser,
} from "./oauth";

// The provider-facing parts of /auth/veracross and /auth/veracross/callback,
// kept free of Supabase and next/headers so they can be tested against a mock
// Veracross (veracross.mock.test.ts). The routes call these and do the rest
// (cookies, accounts, sessions, redirects).

/** Start of sign-in: the school's authorize URL and the state cookie value. */
export function buildVeracrossStart(input: {
  connection: Pick<VeracrossConnection, "schoolRoute" | "clientId" | "scopes">;
  schoolId: string;
  schoolSlug: string;
  appChallenge: string | undefined;
  origin: string;
}): { authorizeUrl: string; cookieValue: string } {
  const state = createVeracrossLoginState(input.schoolId, input.schoolSlug, input.appChallenge);
  const pkce = createPkcePair();
  const authorizeUrl = buildVeracrossAuthorizeUrl({
    client: { schoolRoute: input.connection.schoolRoute, clientId: input.connection.clientId },
    scopes: input.connection.scopes,
    redirectUri: getVeracrossRedirectUri(input.origin),
    state,
    codeChallenge: pkce.challenge,
  });
  const cookieValue = packLoginCookie(state, pkce.verifier);

  return { authorizeUrl, cookieValue };
}

export type VeracrossIdentifyResult =
  | { ok: true; user: VeracrossUser; decision: VeracrossAccessDecision }
  | { ok: false; step: "token" | "userinfo"; error: unknown };

/**
 * Callback core: exchange the code, read userinfo, apply the parent gate.
 * A refused person (not a parent, no email) is `ok: true` with a denying
 * `decision`; `ok: false` means Veracross itself failed.
 */
export async function identifyVeracrossParent(input: {
  connection: Pick<VeracrossConnection, "schoolRoute" | "clientId" | "parentRoles">;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<VeracrossIdentifyResult> {
  let accessToken: string;
  try {
    const token = await exchangeVeracrossCode({
      client: { schoolRoute: input.connection.schoolRoute, clientId: input.connection.clientId },
      clientSecret: input.clientSecret,
      code: input.code,
      redirectUri: input.redirectUri,
      codeVerifier: input.codeVerifier,
    });
    accessToken = token.access_token;
  } catch (error: unknown) {
    return { ok: false, step: "token", error };
  }

  let user: VeracrossUser;
  try {
    user = await fetchVeracrossUser(input.connection.schoolRoute, accessToken);
  } catch (error: unknown) {
    return { ok: false, step: "userinfo", error };
  }

  const decision = decideVeracrossParentAccess({
    user,
    parentRoles: input.connection.parentRoles,
  });

  return { ok: true, user, decision };
}
