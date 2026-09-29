import crypto from "node:crypto";
import { z } from "zod";
import { fcmMessage, isDeadFcmToken, type PushMessage } from "./messages";
import type { SendResult } from "./apns";

// Firebase Cloud Messaging (HTTP v1), which Android notifications go through.
//
// Needs FCM_SERVICE_ACCOUNT_JSON: a Firebase service-account key with the
// "Firebase Cloud Messaging API" enabled. Without it Android sends are skipped.

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const serviceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  token_uri: z.string().url().default("https://oauth2.googleapis.com/token"),
});

type ServiceAccount = z.infer<typeof serviceAccountSchema>;

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    return serviceAccountSchema.parse(JSON.parse(raw));
  } catch (caught: unknown) {
    console.error("[push] FCM_SERVICE_ACCOUNT_JSON is not a valid service account", caught);
    return null;
  }
}

export function isFcmConfigured(): boolean {
  return readServiceAccount() !== null;
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt - ACCESS_TOKEN_REFRESH_MARGIN_MS > now) {
    return cachedAccessToken.value;
  }

  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(now / 1000);
  const signingInput = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.client_email,
    scope: SCOPE,
    aud: account.token_uri,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(signingInput), account.private_key)
    .toString("base64url");

  const response = await fetch(account.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${signature}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`FCM auth failed (${response.status}): ${await response.text()}`);
  }

  const { access_token, expires_in } = z
    .object({ access_token: z.string(), expires_in: z.number() })
    .parse(await response.json());

  cachedAccessToken = { value: access_token, expiresAt: now + expires_in * 1000 };
  return access_token;
}

export async function sendFcm(
  tokens: string[],
  message: PushMessage
): Promise<Map<string, SendResult>> {
  const results = new Map<string, SendResult>();
  const account = readServiceAccount();

  if (!account || tokens.length === 0) {
    tokens.forEach((token) => results.set(token, "failed"));
    return results;
  }

  let bearer: string;
  try {
    bearer = await accessToken(account);
  } catch (caught: unknown) {
    console.error("[push] FCM auth failed", caught);
    tokens.forEach((token) => results.set(token, "failed"));
    return results;
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: fcmMessage(token, message) }),
        });

        if (response.ok) {
          results.set(token, "sent");
          return;
        }

        const detail = (await response.json().catch(() => ({}))) as {
          error?: { status?: string; details?: { errorCode?: string }[] };
        };
        const errorCode =
          detail.error?.details?.find((entry) => entry.errorCode)?.errorCode ??
          detail.error?.status;

        if (isDeadFcmToken(response.status, errorCode)) {
          results.set(token, "dead");
        } else {
          console.error(`[push] FCM rejected a send: ${response.status} ${errorCode ?? ""}`);
          results.set(token, "failed");
        }
      } catch (caught: unknown) {
        console.error("[push] FCM send failed", caught);
        results.set(token, "failed");
      }
    })
  );

  return results;
}
