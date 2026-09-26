import crypto from "node:crypto";
import { z } from "zod";
import { OAUTH_TOKEN_URL } from "./oauth";

// Parent sign-in through Blackbaud ("Sign in with Blackbaud").
//
// Unlike the admin connect flow in oauth.ts, nothing here is persisted: the
// parent's Blackbaud token is used once to learn who they are, then dropped.
// Their AskMySchool session is an ordinary Supabase session from then on.
//
// Uses the authorization-code flow with PKCE, against the same developer app
// (client id/secret) as the admin connection.

export const PARENT_AUTHORIZE_URL = "https://app.blackbaud.com/oauth/authorize";

const SKY_USERS_ME_URL = "https://api.sky.blackbaud.com/school/v1/users/me";

function getAppCredentials() {
  const clientId = process.env.BLACKBAUD_CLIENT_ID;
  const clientSecret = process.env.BLACKBAUD_CLIENT_SECRET;
  const subscriptionKey = process.env.BLACKBAUD_SUBSCRIPTION_KEY;

  if (!clientId || !clientSecret || !subscriptionKey) {
    throw new Error(
      "Blackbaud sign-in not configured (BLACKBAUD_CLIENT_ID / BLACKBAUD_CLIENT_SECRET / BLACKBAUD_SUBSCRIPTION_KEY)"
    );
  }

  return { clientId, clientSecret, subscriptionKey };
}

/**
 * The callback URL Blackbaud sends parents back to. It must be registered on
 * the Blackbaud developer app exactly as returned here, and the authorize and
 * token calls must use the same value.
 */
export function getParentRedirectUri(origin: string): string {
  return (
    process.env.BLACKBAUD_LOGIN_REDIRECT_URI ?? `${origin}/auth/blackbaud/callback`
  );
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(): PkcePair {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  return { verifier, challenge };
}

export function buildParentAuthorizeUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string
): string {
  const { clientId } = getAppCredentials();

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });

  return `${PARENT_AUTHORIZE_URL}?${params.toString()}`;
}

// Blackbaud returns identity fields alongside the token. Only access_token is
// guaranteed; everything else is optional so an upstream change can't lock
// every parent out.
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  environment_id: z.string().nullish(),
  email: z.string().nullish(),
  given_name: z.string().nullish(),
  family_name: z.string().nullish(),
});

export type ParentTokenResponse = z.infer<typeof tokenResponseSchema>;

export async function exchangeParentCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<ParentTokenResponse> {
  const { clientId, clientSecret } = getAppCredentials();

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Blackbaud token request failed (${response.status}): ${detail}`);
  }

  return tokenResponseSchema.parse(await response.json());
}

// GET /school/v1/users/me ("UserMe"). `is_parent` comes from the caller's own
// roles in the school's Education Management system.
const usersMeSchema = z.object({
  id: z.union([z.number(), z.string()]),
  is_parent: z.boolean().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  preferred_name: z.string().nullish(),
});

export interface SchoolCaller {
  id: string;
  isParent: boolean;
  fullName: string;
}

/**
 * Who signed in, according to the school itself. Uses the PARENT's own token,
 * so it describes exactly the person who authenticated — no school-wide user
 * list (and no staff-level API permission) is needed.
 */
export async function fetchSchoolCaller(accessToken: string): Promise<SchoolCaller> {
  const { subscriptionKey } = getAppCredentials();

  const response = await fetch(SKY_USERS_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Bb-Api-Subscription-Key": subscriptionKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`SKY API /users/me failed (${response.status}): ${detail}`);
  }

  const me = usersMeSchema.parse(await response.json());

  return {
    id: String(me.id),
    // Anything other than an explicit true (missing, null) is not a parent.
    isParent: me.is_parent === true,
    fullName: [me.preferred_name ?? me.first_name, me.last_name]
      .filter(Boolean)
      .join(" "),
  };
}

export type ParentAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "wrong_environment" | "not_a_parent" };

/**
 * The gate itself. A parent gets in only when they signed in to THIS school's
 * Blackbaud environment and the school's records say they are a parent.
 */
export function decideParentAccess(input: {
  schoolEnvironmentId: string | null;
  tokenEnvironmentId: string | null | undefined;
  isParent: boolean;
}): ParentAccessDecision {
  if (
    !input.schoolEnvironmentId ||
    !input.tokenEnvironmentId ||
    input.schoolEnvironmentId !== input.tokenEnvironmentId
  ) {
    return { allowed: false, reason: "wrong_environment" };
  }

  if (!input.isParent) {
    return { allowed: false, reason: "not_a_parent" };
  }

  return { allowed: true };
}
