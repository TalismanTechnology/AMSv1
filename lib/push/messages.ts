import crypto from "node:crypto";

// Pure pieces of push delivery: payload shapes, the APNs token, and telling a
// dead device token from a temporary failure. Network code is in apns.ts and
// fcm.ts.

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path to open when the notification is tapped, e.g. /s/collegiate/parent. */
  url: string;
}

const MAX_BODY_LENGTH = 180;

/** Where an announcement notification opens: the announcement itself. */
export function announcementPath(schoolSlug: string, announcementId: string): string {
  return `/s/${encodeURIComponent(schoolSlug)}/parent/announcements#${announcementAnchor(announcementId)}`;
}

/** The element id each announcement carries on the announcements page. */
export function announcementAnchor(announcementId: string): string {
  return `announcement-${announcementId}`;
}

export function truncateBody(body: string, max = MAX_BODY_LENGTH): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;

  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function apnsPayload(message: PushMessage) {
  return {
    aps: {
      alert: { title: message.title, body: message.body },
      sound: "default",
    },
    url: message.url,
  };
}

export function fcmMessage(token: string, message: PushMessage) {
  return {
    token,
    notification: { title: message.title, body: message.body },
    data: { url: message.url },
    android: { priority: "high" as const },
  };
}

export interface ApnsKey {
  keyId: string;
  teamId: string;
  /** The .p8 key from Apple, PEM text. */
  privateKey: string;
}

/** Provider token for APNs: an ES256 JWT, valid for up to an hour. */
export function createApnsJwt(key: ApnsKey, issuedAtSeconds: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode({ alg: "ES256", kid: key.keyId })}.${encode({
    iss: key.teamId,
    iat: issuedAtSeconds,
  })}`;

  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: key.privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
}

/** The token will never work again: forget the device. */
export function isDeadApnsToken(status: number, reason: string | undefined): boolean {
  return status === 410 || (status === 400 && reason === "BadDeviceToken");
}

// Only UNREGISTERED: FCM's INVALID_ARGUMENT also covers a malformed message,
// and treating that as a dead token would drop every device on one bad send.
export function isDeadFcmToken(status: number, errorStatus: string | undefined): boolean {
  return status === 404 && errorStatus === "UNREGISTERED";
}
