"use client";

import { useSyncExternalStore } from "react";
import { formatDistanceToNow } from "date-fns";

// Re-read once a minute. The server snapshot is "", so the server render and
// hydration show nothing and the client fills the text in right after.
function subscribeToMinutes(onTick: () => void) {
  const interval = setInterval(onTick, 60_000);
  return () => clearInterval(interval);
}

export function TimeAgo({ date }: { date: string | Date }) {
  const text = useSyncExternalStore(
    subscribeToMinutes,
    () => formatDistanceToNow(new Date(date), { addSuffix: true }),
    () => ""
  );

  return <span suppressHydrationWarning>{text}</span>;
}
