"use client";

import { useState, useEffect, useRef } from "react";

interface UseTypewriterOptions {
  /** Milliseconds per character during streaming (default 20) */
  speed?: number;
  /** Milliseconds per character when flushing remaining buffer (default 5) */
  flushSpeed?: number;
  /** Called once when all text has been revealed and streaming is done */
  onComplete?: () => void;
}

/**
 * Reveals `text` letter-by-letter with a buffered typewriter effect.
 * While the source text is still growing (streaming), characters are
 * revealed at `speed` ms each. Once streaming stops (text unchanged
 * for 300ms), remaining buffer is flushed at `flushSpeed` ms each.
 */
export function useTypewriter(
  text: string,
  options: UseTypewriterOptions = {}
) {
  const { speed = 20, flushSpeed = 5, onComplete } = options;
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const displayIndexRef = useRef(0);
  const textRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamingRef = useRef(true);
  const stoppedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Keep textRef in sync and detect ongoing streaming
  useEffect(() => {
    textRef.current = text;

    if (text.length > displayIndexRef.current) {
      streamingRef.current = true;
      setIsTyping(true);
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

    const tick = () => {
      const current = textRef.current;
      if (displayIndexRef.current < current.length) {
        displayIndexRef.current += 1;
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

    const currentSpeed = streamingRef.current ? speed : flushSpeed;
    timerRef.current = setInterval(tick, currentSpeed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed, flushSpeed]);

  return { displayText, isTyping };
}
