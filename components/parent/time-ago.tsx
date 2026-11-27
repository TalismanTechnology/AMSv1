"use client";

import { useSyncExternalStore } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useLocale } from "@/components/i18n/locale-provider";

// components/ui/time-ago.tsx in the parent's language ("hace 5 minutos").
// Same behaviour: re-read once a minute, empty on the server and at hydration.
function subscribeToMinutes(onTick: () => void) {
  const interval = setInterval(onTick, 60_000);
  return () => clearInterval(interval);
}

export function LocalizedTimeAgo({ date }: { date: string | Date }) {
  const { locale } = useLocale();
  const text = useSyncExternalStore(
    subscribeToMinutes,
    () =>
      formatDistanceToNow(new Date(date), {
        addSuffix: true,
        ...(locale === "es" ? { locale: es } : {}),
      }),
    () => ""
  );

  return <span suppressHydrationWarning>{text}</span>;
}
