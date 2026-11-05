"use client";

import { useEffect } from "react";
import { trackKeyboardViewport } from "@/lib/viewport/keyboard";

/**
 * Pins the app shell to the visible area while the on-screen keyboard is
 * open (lib/viewport/keyboard.ts). Renders nothing.
 */
export function KeyboardViewport() {
  useEffect(() => trackKeyboardViewport(window), []);
  return null;
}
