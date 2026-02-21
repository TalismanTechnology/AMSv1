"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface UseLongPressOptions {
  duration?: number;
  onLongPress: () => void;
}

export function useLongPress({ duration = 5000, onLongPress }: UseLongPressOptions) {
  const [isPressed, setIsPressed] = useState(false);
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const firedRef = useRef(false);

  const animate = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    const p = Math.min(elapsed / duration, 1);
    setProgress(p);

    if (p >= 1 && !firedRef.current) {
      firedRef.current = true;
      onLongPress();
      setIsPressed(false);
      setProgress(0);
      return;
    }

    if (p < 1) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }, [duration, onLongPress]);

  const cancel = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setIsPressed(false);
    setProgress(0);
    firedRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to primary button (left click / touch)
      if (e.button !== 0) return;
      e.preventDefault();
      startTimeRef.current = Date.now();
      firedRef.current = false;
      setIsPressed(true);
      rafRef.current = requestAnimationFrame(animate);
    },
    [animate]
  );

  const onPointerUp = useCallback(() => cancel(), [cancel]);
  const onPointerLeave = useCallback(() => cancel(), [cancel]);
  const onContextMenu = useCallback((e: React.SyntheticEvent) => e.preventDefault(), []);

  return {
    handlers: { onPointerDown, onPointerUp, onPointerLeave, onContextMenu },
    isPressed,
    progress,
  };
}
