import { z } from "zod";

// Veracross parent sign-in ("Sign in with Veracross").
//
// Veracross acts as an OAuth 2.0 / OpenID Connect identity provider. Each
// school creates its OWN OAuth Application in Axiom, so — unlike Blackbaud,
// where we have one global developer app — the client id/secret are per
// school, and every URL is scoped by the school's route:
//
//   authorize  GET  https://accounts.veracross.com/{route}/oauth/authorize
//   token      POST https://accounts.veracross.com/{route}/oauth/token
//   userinfo   GET  https://accounts.veracross.com/{route}/oauth/userinfo
//
// Sources (all retrieved 2026-10-09):
//   https://api-docs.veracross.com/docs/docs/5fb9f96bc480a-creating-an-sso-integration
//   https://api-docs.veracross.com/docs/docs/fb8d893996a83-authorize
//   https://api-docs.veracross.com/docs/docs/bd459afff2bcb-create-access-token
//   https://api-docs.veracross.com/docs/docs/2fe33316cbd58-user-info
//   https://accounts.veracross.com/api-sandbox/.well-known/openid-configuration
//
// As with Blackbaud, nothing from Veracross is persisted for the parent: the
// token is used once to learn who they are, then dropped.

export const VERACROSS_ACCOUNTS_ORIGIN = "https://accounts.veracross.com";

const REQUEST_TIMEOUT_MS = 15_000;

// The route is interpolated into every URL. Restricting it to the characters
// a route can contain keeps a bad value from rewriting the path or host.
const SCHOOL_ROUTE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

export function isValidSchoolRoute(route: string): boolean {
  return SCHOOL_ROUTE_PATTERN.test(route);
}

export function veracrossAccountsBase(schoolRoute: string): string {
  if (!isValidSchoolRoute(schoolRoute)) {
    throw new Error(`Invalid Veracross school route: ${JSON.stringify(schoolRoute)}`);
  }
  return `${VERACROSS_ACCOUNTS_ORIGIN}/${schoolRoute}`;
}

export const veracrossEndpoints = (schoolRoute: string) => {
  const base = veracrossAccountsBase(schoolRoute);
  return {
    authorize: `${base}/oauth/authorize`,
    token: `${base}/oauth/token`,
    userinfo: `${base}/oauth/userinfo`,
  };
};

/**
 * Normalises a space-separated scope list. Veracross requires `sso` (OAuth
 * 2.0 SSO) or `openid` (OIDC) for sign-in; the school enables one of them on
 * its OAuth Application and we must request it.
 */
export function normalizeSignInScopes(raw: string): string {
  const scopes = Array.from(new Set(raw.split(/\s+/).filter(Boolean)));

  if (!scopes.includes("sso") && !scopes.includes("openid")) {
    throw new Error('Veracross sign-in scopes must include "sso" or "openid"');
  }

  return scopes.join(" ");
}

/**
 * Callback URL Veracross sends parents back to. It must be registered on
 * EACH school's OAuth Application exactly as returned here (Veracross
 * requires HTTPS), and the authorize and token calls must use the same value.
 */
export function getVeracrossRedirectUri(origin: string): string {
  return (
    process.env.VERACROSS_LOGIN_REDIRECT_URI ?? `${origin}/auth/veracross/callback`
  );
}

export interface VeracrossClient {
  schoolRoute: string;
  clientId: string;
}

export function buildVeracrossAuthorizeUrl(input: {
  client: VeracrossClient;
  scopes: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.client.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: normalizeSignInScopes(input.scopes),
    // `state` isn't listed on Veracross's Authorize page, but RFC 6749 §4.1.2
    // requires the server to return it unchanged; it's our CSRF binding.
    state: input.state,
    // PKCE isn't advertised in Veracross's discovery document. Servers must
    // ignore parameters they don't recognise (RFC 6749 §3.1), so this is
    // harmless if unsupported and extra protection if it is.
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });

  return `${veracrossEndpoints(input.client.schoolRoute).authorize}?${params.toString()}`;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().nullish(),
  scope: z.string().nullish(),
  expires_in: z.number().nullish(),
  id_token: z.string().nullish(),
});

export type VeracrossTokenResponse = z.infer<typeof tokenResponseSchema>;

async function postToken(
  schoolRoute: string,
  body: URLSearchParams
): Promise<VeracrossTokenResponse> {
  const response = await fetch(veracrossEndpoints(schoolRoute).token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Veracross token request failed (${response.status}): ${detail}`);
  }

  return tokenResponseSchema.parse(await response.json());
}

/**
 * Authorization-code exchange. Veracross authenticates the client with the id
 * and secret in the form body (`client_secret_post`, the only method its
 * discovery document lists), not HTTP Basic as Blackbaud does.
 */
export async function exchangeVeracrossCode(input: {
  client: VeracrossClient;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<VeracrossTokenResponse> {
  return postToken(
    input.client.schoolRoute,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.client.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    })
  );
}

/**
 * Server-to-server token for the Data API (children lookup). Requires the
 * school to have enabled those scopes on the same OAuth Application.
 */
export async function getVeracrossClientCredentialsToken(input: {
  client: VeracrossClient;
  clientSecret: string;
  scopes: string[];
}): Promise<string> {
  const token = await postToken(
    input.client.schoolRoute,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: input.client.clientId,
      client_secret: input.clientSecret,
      scope: input.scopes.join(" "),
    })
  );

  return token.access_token;
}

// Documented fields are sub, preferred_username, email, roles. The name
// claims aren't documented; they're read only if present.
const userInfoSchema = z.object({
  sub: z.union([z.string().min(1), z.number()]),
  preferred_username: z.string().nullish(),
  email: z.string().nullish(),
  roles: z.array(z.string()).nullish(),
  name: z.string().nullish(),
  given_name: z.string().nullish(),
  family_name: z.string().nullish(),
});

export interface VeracrossUser {
  /** Internal account id. Unique only within the school route. */
  sub: string;
  username: string | null;
  email: string | null;
  roles: string[];
  fullName: string;
}

export function parseVeracrossUserInfo(raw: unknown): VeracrossUser {
  const info = userInfoSchema.parse(raw);

  return {
    sub: String(info.sub),
    username: info.preferred_username ?? null,
    email: info.email ?? null,
    roles: info.roles ?? [],
    fullName:
      info.name ?? [info.given_name, info.family_name].filter(Boolean).join(" "),
  };
}

/** Who signed in, according to the school's Veracross. */
export async function fetchVeracrossUser(
  schoolRoute: string,
  accessToken: string
): Promise<VeracrossUser> {
  const response = await fetch(veracrossEndpoints(schoolRoute).userinfo, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      // Listed as required on the User Info reference page, even for GET.
      "Content-Type": "application/x-www-form-urlencoded",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Veracross userinfo failed (${response.status}): ${detail}`);
  }

  return parseVeracrossUserInfo(await response.json());
}

export type VeracrossAccessDecision =
  | { allowed: true; email: string }
  | { allowed: false; reason: "not_a_parent" | "no_email" };

/**
 * The gate. The token can only have come from this school (per-school route
 * and client), so what's left is: is this person a parent there, and do we
 * have an email to key their account on?
 *
 * Veracross recommends exactly this check ("validate user info properties
 * before allowing users to log in ... check that Student is one of the users
 * roles"). Role names are compared case-insensitively.
 */
export function decideVeracrossParentAccess(input: {
  user: Pick<VeracrossUser, "roles" | "email">;
  parentRoles: string[];
}): VeracrossAccessDecision {
  const allowed = new Set(input.parentRoles.map((role) => role.trim().toLowerCase()));
  const isParent = input.user.roles.some((role) => allowed.has(role.trim().toLowerCase()));

  if (!isParent) {
    return { allowed: false, reason: "not_a_parent" };
  }

  const email = input.user.email?.trim();
  if (!email || !email.includes("@")) {
    return { allowed: false, reason: "no_email" };
  }

  return { allowed: true, email };
}
