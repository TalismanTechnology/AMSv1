"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoSpinner } from "@/components/logo-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SchoolPicker } from "@/components/auth/school-picker";
import { listJoinableSchools } from "@/actions/sign-in-schools";
import type { JoinableSchools } from "@/lib/auth/joinable-schools";
import { useT } from "@/components/i18n/locale-provider";

interface JoinSchoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Adding another school is the same as signing in to it: pick the school,
// sign in with its Blackbaud, and the roster decides. Schools the user
// already belongs to aren't offered.
export function JoinSchoolDialog({ open, onOpenChange }: JoinSchoolDialogProps) {
  const [schools, setSchools] = useState<JoinableSchools | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    if (!open || schools) return;

    let cancelled = false;
    listJoinableSchools().then((result) => {
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else setSchools(result);
    });

    return () => {
      cancelled = true;
    };
  }, [open, schools]);

  const nothingToAdd = schools !== null && schools.available.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("parent.joinSchool.title")}</DialogTitle>
          {!nothingToAdd && (
            <DialogDescription>{t("parent.joinSchool.description")}</DialogDescription>
          )}
        </DialogHeader>

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : schools ? (
          <div className="space-y-3">
            {nothingToAdd ? (
              <p className="rounded-xl border border-border bg-secondary/60 px-5 py-6 text-center text-sm text-ink-soft">
                {t("parent.joinSchool.allJoinedBefore")}
                <Link
                  href="/support"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  {t("parent.joinSchool.contactUs")}
                </Link>
                {t("parent.joinSchool.allJoinedAfter")}
              </p>
            ) : (
              <SchoolPicker schools={schools.available} />
            )}
            {schools.pending.length > 0 && (
              <p className="text-center text-sm text-ink-soft">
                {t("parent.joinSchool.pending", {
                  schools: schools.pending.map((school) => school.name).join(", "),
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="flex justify-center py-6">
            <LogoSpinner />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
