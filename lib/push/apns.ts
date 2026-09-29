import http2 from "node:http2";
import { apnsPayload, createApnsJwt, isDeadApnsToken, type ApnsKey, type PushMessage } from "./messages";

// Apple Push Notification service, spoken directly over HTTP/2.
//
// Needs APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY (the .p8 key from the
// Apple Developer account). Without them iOS sends are skipped.

const HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

type ApnsHost = keyof typeof HOSTS;

// Apple rejects tokens older than an hour and throttles fresh ones, so reuse.
const JWT_LIFETIME_MS = 50 * 60 * 1000;
let cachedJwt: { value: string; expiresAt: number } | null = null;

export type SendResult = "sent" | "dead" | "failed";

function readKey(): ApnsKey | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  // Env UIs often flatten newlines into "\n".
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!keyId || !teamId || !privateKey) return null;
  return { keyId, teamId, privateKey };
}

export function isApnsConfigured(): boolean {
  return readKey() !== null;
}

function providerToken(key: ApnsKey): string {
  const now = Date.now();
  if (!cachedJwt || cachedJwt.expiresAt <= now) {
    cachedJwt = {
      value: createApnsJwt(key, Math.floor(now / 1000)),
      expiresAt: now + JWT_LIFETIME_MS,
    };
  }
  return cachedJwt.value;
}

function post(
  session: http2.ClientHttp2Session,
  token: string,
  jwt: string,
  body: string
): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve, reject) => {
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": process.env.APNS_BUNDLE_ID ?? "app.askmyschool",
      "apns-push-type": "alert",
      "content-type": "application/json",
    });

    let status = 0;
    let data = "";
    request.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      data += chunk;
    });
    request.on("end", () => {
      let reason: string | undefined;
      try {
        reason = data ? (JSON.parse(data) as { reason?: string }).reason : undefined;
      } catch {
        reason = undefined;
      }
      resolve({ status, reason });
    });
    request.on("error", reject);
    request.end(body);
  });
}

/**
 * Sends one message to many iOS tokens. Tokens from TestFlight / App Store
 * builds are production tokens; ones from Xcode debug builds only work on the
 * sandbox host, so a production "BadDeviceToken" is retried there first.
 */
export async function sendApns(
  tokens: string[],
  message: PushMessage
): Promise<Map<string, SendResult>> {
  const results = new Map<string, SendResult>();
  const key = readKey();

  if (!key || tokens.length === 0) {
    tokens.forEach((token) => results.set(token, "failed"));
    return results;
  }

  const jwt = providerToken(key);
  const body = JSON.stringify(apnsPayload(message));
  const sessions = new Map<ApnsHost, http2.ClientHttp2Session>();
  const sessionFor = (host: ApnsHost) => {
    let session = sessions.get(host);
    if (!session) {
      session = http2.connect(HOSTS[host]);
      session.on("error", (error) => console.error(`[push] APNs ${host} session error`, error));
      sessions.set(host, session);
    }
    return session;
  };

  try {
    await Promise.all(
      tokens.map(async (token) => {
        try {
          let response = await post(sessionFor("production"), token, jwt, body);
          if (response.status === 400 && response.reason === "BadDeviceToken") {
            response = await post(sessionFor("sandbox"), token, jwt, body);
          }

          if (response.status === 200) {
            results.set(token, "sent");
          } else if (isDeadApnsToken(response.status, response.reason)) {
            results.set(token, "dead");
          } else {
            console.error(`[push] APNs rejected a send: ${response.status} ${response.reason ?? ""}`);
            results.set(token, "failed");
          }
        } catch (caught: unknown) {
          console.error("[push] APNs send failed", caught);
          results.set(token, "failed");
        }
      })
    );
  } finally {
    sessions.forEach((session) => session.close());
  }

  return results;
}
