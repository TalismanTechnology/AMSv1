"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { skipChildrenPrompt } from "@/actions/onboarding";
import { useT } from "@/components/i18n/locale-provider";

interface AddChildrenPromptProps {
  slug: string;
}

/**
 * Shown once per session in the parent area to a parent with no children on
 * file. "Add children" goes to the welcome step; dismissing it in any way
 * counts as "Skip for now" until the next session.
 */
export function AddChildrenPrompt({ slug }: AddChildrenPromptProps) {
  const [open, setOpen] = useState(true);
  const t = useT();

  function skip() {
    setOpen(false);
    void skipChildrenPrompt();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : skip())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("parent.addChildren.title")}</DialogTitle>
          <DialogDescription>{t("parent.addChildren.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={skip}>
            {t("parent.addChildren.skip")}
          </Button>
          <Button asChild onClick={() => setOpen(false)}>
            <Link href={`/s/${slug}/welcome`}>{t("parent.addChildren.add")}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
