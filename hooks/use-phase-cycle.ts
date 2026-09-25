"use client";

import { useEffect, useState } from "react";

/**
 * Steps through a looping sequence of phases, holding each for its duration
 * (ms). Pauses while `isActive` is false so offscreen loops cost nothing,
 * and resumes where it left off. `durations` must be a stable reference.
 */
export function usePhaseCycle(durations: readonly number[], isActive: boolean): number {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    const id = setTimeout(
      () => setPhase((p) => (p + 1) % durations.length),
      durations[phase]
    );
    return () => clearTimeout(id);
  }, [phase, isActive, durations]);

  return phase;
}
