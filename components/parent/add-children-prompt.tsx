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

  function skip() {
    setOpen(false);
    void skipChildrenPrompt();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : skip())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your children</DialogTitle>
          <DialogDescription>
            Tell us who your children are so answers can be tailored to their
            grade. You can also do this any time in Profile.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={skip}>
            Skip for now
          </Button>
          <Button asChild onClick={() => setOpen(false)}>
            <Link href={`/s/${slug}/welcome`}>Add children</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
