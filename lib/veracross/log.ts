// One structured line per Veracross failure (and per successful sign-in), so
// problems are easy to find in Vercel logs by searching "[veracross]".
//
// Lines never contain secrets, tokens, authorization codes or full emails:
// only the step, school id, Veracross route, HTTP status, the OAuth error
// code when there is one, a hint, and a short redacted reason.

export type VeracrossStep =
  | "authorize"
  | "token"
  | "userinfo"
  | "gate"
  | "link"
  | "children"
  | "client_token"
  | "data_api";

/** A non-2xx response from Veracross. `message` keeps the historic format. */
export class VeracrossHttpError extends Error {
  constructor(
    message: string,
    readonly step: Extract<VeracrossStep, "token" | "client_token" | "userinfo" | "data_api">,
    readonly status: number,
    /** OAuth `error` code from the body (`invalid_grant`, ...), if any. */
    readonly oauthError: string | null = null,
    /** Data API path with ids replaced, e.g. `/parents/{id}`. */
    readonly endpoint: string | null = null
  ) {
    super(message);
    this.name = "VeracrossHttpError";
  }
}

/** `error` from an OAuth JSON error body, if it looks like one. */
export function parseOAuthErrorCode(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const code = (parsed as { error: unknown }).error;
      if (typeof code === "string" && /^[a-z_]{1,64}$/.test(code)) return code;
    }
  } catch {
    // Not JSON.
  }
  return null;
}

/** What most likely went wrong, for the common cases. */
export function veracrossHint(
  step: VeracrossStep,
  status: number | null,
  oauthError: string | null
): string | null {
  if (oauthError === "invalid_grant") return "code expired/used or redirect_uri mismatch";
  if (oauthError === "invalid_client") return "client id/secret wrong or reset";
  if (oauthError === "invalid_scope" || oauthError === "unauthorized_client") {
    return step === "client_token"
      ? "Data API scopes not enabled on the school's OAuth Application"
      : "sso/openid scope not enabled on the school's OAuth Application";
  }
  if (step === "data_api" && status === 401) return "token expired or revoked (10-token cap?)";
  if (step === "data_api" && status === 403) return "scope not enabled on the OAuth Application";
  if (step === "userinfo" && status === 401) return "user access token rejected";
  if ((step === "token" || step === "client_token") && status === 401) {
    return "client id/secret wrong or reset";
  }
  return null;
}

const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const BEARER = /Bearer\s+\S+/gi;
// Long opaque strings (tokens, codes, secrets). UUIDs have shorter segments.
const OPAQUE = /[A-Za-z0-9+/_=]{32,}/g;

export function redactForLog(text: string): string {
  return text
    .replace(BEARER, "Bearer [redacted]")
    .replace(EMAIL, "$1***@$2")
    .replace(OPAQUE, "[redacted]")
    .slice(0, 200);
}

function describeError(error: unknown): string {
  if (error instanceof VeracrossHttpError) {
    return error.oauthError ?? `http ${error.status}`;
  }
  if (error instanceof Error) {
    if (error.name === "ZodError") return "unexpected response shape";
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
    if (error instanceof TypeError && error.message === "fetch failed") return "network error";
    return redactForLog(error.message);
  }
  return "unknown error";
}

export interface VeracrossFailure {
  step: VeracrossStep;
  schoolId: string | null;
  route?: string | null;
  error?: unknown;
  /** Used instead of a reason derived from `error`. */
  reason?: string;
  /** Extra non-PII fields, e.g. the roles a refused account carried. */
  extra?: Record<string, string | number | boolean | string[] | null>;
}

/** The fields of the log line (pure; exported for tests). */
export function describeVeracrossFailure(failure: VeracrossFailure): Record<string, unknown> {
  const http = failure.error instanceof VeracrossHttpError ? failure.error : null;
  const status = http?.status ?? null;
  const oauthError = http?.oauthError ?? null;

  return {
    event: "failure",
    step: failure.step,
    school: failure.schoolId,
    route: failure.route ?? null,
    status,
    ...(http?.endpoint ? { endpoint: http.endpoint } : {}),
    reason: failure.reason ?? describeError(failure.error),
    hint: veracrossHint(failure.step, status, oauthError),
    ...failure.extra,
  };
}

export function logVeracrossFailure(failure: VeracrossFailure): void {
  console.error(`[veracross] ${JSON.stringify(describeVeracrossFailure(failure))}`);
}

export function logVeracrossSignIn(input: {
  schoolId: string;
  route: string;
  firstLink: boolean;
  app: boolean;
  children: { found: number; inserted: number; updated: number } | null;
}): void {
  console.info(
    `[veracross] ${JSON.stringify({
      event: "sign_in",
      school: input.schoolId,
      route: input.route,
      firstLink: input.firstLink,
      app: input.app,
      children: input.children,
    })}`
  );
}
