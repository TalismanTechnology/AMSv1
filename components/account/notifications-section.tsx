"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setNewDocumentPush } from "@/actions/notification-preferences";
import { useT } from "@/components/i18n/locale-provider";

interface NotificationsSectionProps {
  /** Whether new-document pushes are on for this parent (default on). */
  newDocumentPush: boolean;
  /** The school's display name, or null to say "your school". */
  schoolName: string | null;
}

/** Profile settings: push notifications the iPhone / Android app shows. */
export function NotificationsSection({
  newDocumentPush: initial,
  schoolName,
}: NotificationsSectionProps) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);
  const t = useT();

  async function handleChange(next: boolean) {
    setEnabled(next);
    setSaving(true);
    const result = await setNewDocumentPush(next);
    setSaving(false);
    if ("error" in result) {
      setEnabled(!next);
      toast.error(result.error);
    }
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
          {t("parent.notificationSettings.title")}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("parent.notificationSettings.description")}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="new-document-push">{t("parent.notificationSettings.newDocuments")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("parent.notificationSettings.newDocumentsHint", {
              school: schoolName ?? t("parent.notificationSettings.yourSchool"),
            })}
          </p>
        </div>
        <Switch
          id="new-document-push"
          checked={enabled}
          onCheckedChange={handleChange}
          disabled={saving}
        />
      </div>
    </section>
  );
}
