"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Trash2 } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  createLabel,
  deleteLabel,
  removeLabelLink,
  setLabelLink,
  setLabelSyncPaused,
  updateLabel,
  type LabelActionResult,
} from "@/actions/calendar-labels";
import {
  CALENDAR_COLOR_PALETTE,
  calendarColorClasses,
  nextLabelColor,
} from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import type { LabelWithLink } from "@/components/admin/calendar-labels-panel";

interface LabelFormDialogProps {
  /** The label being edited; omitted to create one. */
  label?: LabelWithLink;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  /** Colors other labels already use, so a new label starts on a fresh one. */
  usedColors: string[];
}

// The link's zone decides what "3:30pm" in the feed means. The admin's
// browser zone is the school's in practice.
function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function reportLinkResult(result: LabelActionResult, verb: string) {
  if (result.syncError) {
    toast.warning(`${verb}, but the first sync failed: ${result.syncError}`);
  } else if (result.published !== undefined) {
    toast.success(`${verb} — ${result.published} event${result.published === 1 ? "" : "s"} synced.`);
  } else {
    toast.success(verb);
  }
}

export function LabelFormDialog({
  label,
  open,
  onOpenChange,
  schoolId,
  usedColors,
}: LabelFormDialogProps) {
  const isEditing = !!label;
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("sky");
  const [url, setUrl] = useState("");
  const [isReplacingLink, setIsReplacingLink] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "unlink" | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(label?.name ?? "");
    setColor(label?.color ?? nextLabelColor(usedColors));
    setUrl("");
    setIsReplacingLink(false);
    setIsPaused(label?.link ? !label.link.isActive : false);
    setConfirm(null);
    // Reset only when the dialog opens, not as usedColors changes under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, label]);

  const showLinkInput = !label?.link || isReplacingLink;

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const link = url.trim() ? { url: url.trim(), timezone: browserTimeZone() } : null;

    try {
      if (!label) {
        const result = await createLabel(schoolId, { name: name.trim(), color, link });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        reportLinkResult(result, "Label created");
        onOpenChange(false);
        return;
      }

      if (name.trim() !== label.name || color !== label.color) {
        const result = await updateLabel(schoolId, label.id, { name: name.trim(), color });
        if (result.error) {
          toast.error(result.error);
          return;
        }
      }
      if (link) {
        const result = await setLabelLink(schoolId, label.id, link);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        reportLinkResult(result, label.link ? "Link replaced" : "Link added");
      } else {
        toast.success("Label saved");
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handlePauseChange(paused: boolean) {
    if (!label) return;
    setIsPaused(paused);
    const result = await setLabelSyncPaused(schoolId, label.id, paused);
    if (result.error) {
      setIsPaused(!paused);
      toast.error(result.error);
    }
  }

  async function handleConfirm() {
    if (!label || !confirm) return;
    setSaving(true);
    const result =
      confirm === "delete"
        ? await deleteLabel(schoolId, label.id)
        : await removeLabelLink(schoolId, label.id);
    setSaving(false);
    setConfirm(null);
    if (result.error) {
          toast.error(result.error);
          return;
        }
    toast.success(confirm === "delete" ? "Label deleted" : "Link removed");
    if (confirm === "delete") onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
              {isEditing ? "Edit label" : "New label"}
            </DialogTitle>
            <DialogDescription>
              Events under this label show in its color. Add an iCal link to
              keep them in sync with a Blackbaud calendar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="label-name" className="text-ink-soft">
                Name
              </Label>
              <Input
                id="label-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Upper School Athletics"
                maxLength={80}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink-soft">Color</legend>
              <div className="flex flex-wrap gap-2">
                {CALENDAR_COLOR_PALETTE.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setColor(option)}
                    aria-label={option}
                    aria-pressed={color === option}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      calendarColorClasses(option).dot,
                      color === option && "ring-2 ring-ink"
                    )}
                  >
                    {color === option && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink-soft">iCal link</span>
                <span className="text-xs text-muted-foreground">Optional</span>
              </div>

              {label?.link && !isReplacingLink && (
                <div className="space-y-3">
                  <p className="truncate rounded-md bg-secondary px-3 py-2 text-xs text-ink">
                    {label.link.host}
                    <span className="text-muted-foreground"> · {label.link.timezone}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="label-sync-paused"
                      checked={!isPaused}
                      onCheckedChange={(on) => handlePauseChange(!on)}
                    />
                    <Label htmlFor="label-sync-paused" className="text-xs text-muted-foreground">
                      {isPaused ? "Sync paused" : "Syncing automatically"}
                    </Label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsReplacingLink(true)}>
                      Replace link
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirm("unlink")}
                    >
                      Remove link
                    </Button>
                  </div>
                </div>
              )}

              {showLinkInput && (
                <div className="space-y-1.5">
                  <Input
                    id="label-url"
                    aria-label="iCal link"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="webcal://yourschool.myschoolapp.com/podium/feed/ical.aspx?…"
                  />
                  <p className="text-xs text-muted-foreground">
                    In Blackbaud, open the calendar and copy its iCal or
                    subscribe link. We check the link before saving it.
                    {label?.link && " Events from the old link come off the calendar."}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              {isEditing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirm("delete")}
                  disabled={saving}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!name.trim() || saving}>
                  {saving && <LogoSpinner className="mr-2" />}
                  {saving && url.trim() ? "Checking link…" : isEditing ? "Save" : "Create label"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
        title={confirm === "delete" ? `Delete “${label?.name}”?` : "Remove this link?"}
        description={
          confirm === "delete"
            ? "Events synced from its iCal link are removed from the calendar. Events added by hand stay, with no label."
            : "Events synced from this link are removed from the calendar. The label and any events added by hand stay."
        }
        confirmLabel={confirm === "delete" ? "Delete label" : "Remove link"}
        variant="destructive"
        loading={saving}
        onConfirm={handleConfirm}
      />
    </>
  );
}
