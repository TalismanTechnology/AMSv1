"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogoSpinner } from "@/components/logo-spinner";
import { deleteMyAccount } from "@/actions/account";
import { useT } from "@/components/i18n/locale-provider";

const CONFIRMATION = "DELETE";

/** "Delete my account" for the profile page, behind a type-to-confirm dialog. */
export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const t = useT();

  const confirmed = typed.trim().toUpperCase() === CONFIRMATION;

  async function handleDelete() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    // On success the action redirects to the home page and never returns.
    const result = await deleteMyAccount(typed);
    if (result?.error) {
      toast.error(result.error);
      setDeleting(false);
    }
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
          {t("parent.deleteAccount.title")}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("parent.deleteAccount.subtitle")}
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-destructive/25 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">
          {t("parent.deleteAccount.summary")}
        </p>
        <Button
          variant="outline"
          className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => {
            setTyped("");
            setOpen(true);
          }}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          {t("parent.deleteAccount.button")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("parent.deleteAccount.confirmTitle")}</DialogTitle>
            <DialogDescription>{t("parent.deleteAccount.confirmDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              {t("parent.deleteAccount.typeBefore")}
              <span className="font-mono font-semibold">{CONFIRMATION}</span>
              {t("parent.deleteAccount.typeAfter")}
            </Label>
            <Input
              id="delete-confirm"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleDelete();
                }
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={deleting} onClick={() => setOpen(false)}>
              {t("parent.action.cancel")}
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!confirmed || deleting}
              onClick={handleDelete}
            >
              {deleting && <LogoSpinner className="mr-2" />}
              {t("parent.deleteAccount.button")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
