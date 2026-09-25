"use client";

import { createContext, useContext, useRef, useSyncExternalStore, type RefObject } from "react";
import { useInView } from "framer-motion";

// The stacking deck tells each card's visual whether it is the card on top.
// A buried card is still "in view" to IntersectionObserver, so the loops use
// this to pause while covered instead of animating under the next card.
// Outside the deck the context is absent and a visual just plays in view.

const StepActiveContext = createContext<boolean | null>(null);

export const StepActiveProvider = StepActiveContext.Provider;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * The reduced-motion preference, hydration-safe: it reads as false while
 * hydrating (matching the server HTML) and updates right after. framer's
 * `useReducedMotion` reads the media query on the first client render,
 * which makes any markup branched on it mismatch the server.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

/**
 * Whether a looping step visual should be running: on screen, on top of the
 * deck, and motion allowed. Attach the returned ref to the visual's root.
 */
export function useStepPlayback<T extends Element>(): {
  ref: RefObject<T | null>;
  isPlaying: boolean;
  reduceMotion: boolean;
} {
  const ref = useRef<T>(null);
  const isInView = useInView(ref, { amount: 0.25 });
  const isOnTop = useContext(StepActiveContext) ?? true;
  const reduceMotion = usePrefersReducedMotion();
  return { ref, isPlaying: isInView && isOnTop && !reduceMotion, reduceMotion };
}
