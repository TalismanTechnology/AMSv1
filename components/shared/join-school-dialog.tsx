"use client";

import { useEffect, useState } from "react";
import { LogoSpinner } from "@/components/logo-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SchoolPicker } from "@/components/auth/school-picker";
import { listSignInSchools } from "@/actions/sign-in-schools";
import type { SignInSchool } from "@/lib/auth/sign-in-schools";

interface JoinSchoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Adding another school is the same as signing in to it: pick the school,
// sign in with its Blackbaud, and the roster decides.
export function JoinSchoolDialog({ open, onOpenChange }: JoinSchoolDialogProps) {
  const [schools, setSchools] = useState<SignInSchool[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || schools) return;

    let cancelled = false;
    listSignInSchools().then((result) => {
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else setSchools(result.schools);
    });

    return () => {
      cancelled = true;
    };
  }, [open, schools]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a school</DialogTitle>
          <DialogDescription>
            Choose the school and sign in with its Blackbaud account.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : schools ? (
          <SchoolPicker schools={schools} />
        ) : (
          <div className="flex justify-center py-6">
            <LogoSpinner />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
