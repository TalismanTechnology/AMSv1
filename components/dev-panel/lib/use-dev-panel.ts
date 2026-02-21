"use client";

import { useState, useCallback, useEffect } from "react";

const SESSION_KEY = "dev-panel-auth";

export function useDevPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  useEffect(() => {
    setIsAuthenticated(sessionStorage.getItem(SESSION_KEY) === "1");
  }, []);

  const handleLongPress = useCallback(() => {
    if (isAuthenticated) {
      setIsDrawerOpen(true);
    } else {
      setShowPasswordDialog(true);
    }
  }, [isAuthenticated]);

  const handlePasswordSubmit = useCallback((password: string): boolean => {
    if (password === "Orchestra") {
      sessionStorage.setItem(SESSION_KEY, "1");
      setIsAuthenticated(true);
      setShowPasswordDialog(false);
      setIsDrawerOpen(true);
      return true;
    }
    return false;
  }, []);

  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const closePasswordDialog = useCallback(() => setShowPasswordDialog(false), []);

  return {
    isAuthenticated,
    isDrawerOpen,
    showPasswordDialog,
    handleLongPress,
    handlePasswordSubmit,
    closeDrawer,
    closePasswordDialog,
  };
}
