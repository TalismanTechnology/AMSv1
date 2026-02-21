"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Code2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PasswordDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (password: string) => boolean;
}

export function PasswordDialog({ open, onClose, onSubmit }: PasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = onSubmit(password);
    if (!success) {
      setError(true);
      setPassword("");
      setTimeout(() => setError(false), 600);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="metallic-card sm:max-w-sm" style={{ position: "fixed" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5 neon-icon-blue" />
            <span className="metallic-text">Developer Access</span>
          </DialogTitle>
          <DialogDescription>
            Enter the developer password to continue.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <motion.div
            animate={error ? { x: [0, -10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <Input
              ref={inputRef}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={error ? "border-destructive" : ""}
              autoComplete="off"
            />
          </motion.div>
          {error && (
            <p className="text-destructive text-xs mt-1.5">Incorrect password</p>
          )}
          <Button type="submit" className="w-full mt-4" disabled={!password}>
            Unlock
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
