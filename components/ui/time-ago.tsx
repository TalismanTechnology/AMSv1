"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

export function TimeAgo({ date }: { date: string | Date }) {
  const [text, setText] = useState("");

  useEffect(() => {
    const d = new Date(date);
    setText(formatDistanceToNow(d, { addSuffix: true }));

    const interval = setInterval(() => {
      setText(formatDistanceToNow(d, { addSuffix: true }));
    }, 60_000);

    return () => clearInterval(interval);
  }, [date]);

  return <span suppressHydrationWarning>{text}</span>;
}
