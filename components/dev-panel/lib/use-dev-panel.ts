"use client";

import { useState, useCallback } from "react";

const SESSION_KEY = "dev-panel-auth";

export function useDevPanel() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  // Read when needed rather than mirrored into state on mount: the password
  // submit below writes the same key.
  const handleLongPress = useCallback(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setIsDrawerOpen(true);
    } else {
      setShowPasswordDialog(true);
    }
  }, []);

  const handlePasswordSubmit = useCallback((password: string): boolean => {
    if (password === "Orchestra") {
      sessionStorage.setItem(SESSION_KEY, "1");
      setShowPasswordDialog(false);
      setIsDrawerOpen(true);
      return true;
    }
    return false;
  }, []);

  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const closePasswordDialog = useCallback(() => setShowPasswordDialog(false), []);

  return {
    isDrawerOpen,
    showPasswordDialog,
    handleLongPress,
    handlePasswordSubmit,
    closeDrawer,
    closePasswordDialog,
  };
}
