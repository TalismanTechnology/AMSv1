"use client";

import { useState, useEffect, useRef } from "react";

interface UseTypewriterOptions {
  /** Milliseconds per character during streaming (default 8) */
  speed?: number;
  /** Milliseconds per tick when flushing remaining buffer (default 5) */
  flushSpeed?: number;
  /**
   * Characters revealed per tick when flushing (default 3). Timers can't
   * usefully fire faster than ~4ms, so a faster flush reveals more per tick.
   */
  flushStep?: number;
  /** Called once when all text has been revealed and streaming is done */
  onComplete?: () => void;
}

/**
 * Reveals `text` letter-by-letter with a buffered typewriter effect.
 * While the source text is still growing (streaming), characters are
 * revealed at `speed` ms each. Once streaming stops (text unchanged
 * for 300ms), remaining buffer is flushed `flushStep` characters every
 * `flushSpeed` ms.
 */
export function useTypewriter(
  text: string,
  options: UseTypewriterOptions = {}
) {
  const { speed = 8, flushSpeed = 5, flushStep = 3, onComplete } = options;
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const displayIndexRef = useRef(0);
  const textRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamingRef = useRef(true);
  const stoppedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  // Only read from the interval callback, so syncing after commit is enough.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Keep textRef in sync and detect ongoing streaming
  useEffect(() => {
    textRef.current = text;

    if (text.length > displayIndexRef.current) {
      streamingRef.current = true;
    }

    // After 300ms of no text growth, mark streaming as done
    if (stoppedTimerRef.current) clearTimeout(stoppedTimerRef.current);
    stoppedTimerRef.current = setTimeout(() => {
      streamingRef.current = false;
    }, 300);

    return () => {
      if (stoppedTimerRef.current) clearTimeout(stoppedTimerRef.current);
    };
  }, [text]);

  // Main typing interval
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const streaming = streamingRef.current;
    const step = streaming ? 1 : flushStep;
    const tick = () => {
      const current = textRef.current;
      if (displayIndexRef.current < current.length) {
        displayIndexRef.current = Math.min(current.length, displayIndexRef.current + step);
        setDisplayText(current.slice(0, displayIndexRef.current));
        setIsTyping(true);
      } else if (!streamingRef.current) {
        // All caught up and streaming is done
        setIsTyping(false);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        onCompleteRef.current?.();
      }
    };

    const currentSpeed = streaming ? speed : flushSpeed;
    timerRef.current = setInterval(tick, currentSpeed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed, flushSpeed, flushStep]);

  // Text not yet revealed counts as typing from the moment it arrives (the
  // caret shows before the first tick).
  return { displayText, isTyping: isTyping || text.length > displayText.length };
}
