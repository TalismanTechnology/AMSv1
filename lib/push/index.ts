import { createAdminClient } from "@/lib/supabase/admin";
import { isApnsConfigured, sendApns, type SendResult } from "./apns";
import { isFcmConfigured, sendFcm } from "./fcm";
import type { PushMessage } from "./messages";

// Push notifications to the iOS / Android apps. Everything here is
// best-effort: a failed push is logged, never surfaced to whoever triggered it.

export type { PushMessage } from "./messages";

interface DeviceRow {
  token: string;
  platform: "ios" | "android";
}

export async function sendPushToUsers(userIds: string[], message: PushMessage): Promise<void> {
  if (userIds.length === 0) return;
  if (!isApnsConfigured() && !isFcmConfigured()) return;

  const admin = createAdminClient();
  const { data: devices, error } = await admin
    .from("push_devices")
    .select("token, platform")
    .in("user_id", userIds);

  if (error) {
    console.error("[push] could not load devices", error);
    return;
  }

  const rows = (devices ?? []) as DeviceRow[];
  const byPlatform = (platform: DeviceRow["platform"]) =>
    rows.filter((row) => row.platform === platform).map((row) => row.token);

  const [iosResults, androidResults] = await Promise.all([
    sendApns(byPlatform("ios"), message),
    sendFcm(byPlatform("android"), message),
  ]);

  const dead = [...iosResults, ...androidResults]
    .filter(([, result]: [string, SendResult]) => result === "dead")
    .map(([token]) => token);

  if (dead.length > 0) {
    const { error: deleteError } = await admin.from("push_devices").delete().in("token", dead);
    if (deleteError) console.error("[push] could not remove dead tokens", deleteError);
  }
}
