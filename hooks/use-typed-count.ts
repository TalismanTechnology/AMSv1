"use client";

import { useEffect, useState } from "react";

/**
 * Characters typed so far while `isTyping` is true, one every `msPerChar`,
 * capped at `length`. Resets to 0 whenever typing stops, so callers decide
 * what to show outside the typing window (usually empty before, full after).
 */
export function useTypedCount(length: number, isTyping: boolean, msPerChar: number): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isTyping) return;
    const id = setInterval(() => setCount((c) => Math.min(length, c + 1)), msPerChar);
    return () => {
      clearInterval(id);
      setCount(0);
    };
  }, [isTyping, length, msPerChar]);

  return count;
}
