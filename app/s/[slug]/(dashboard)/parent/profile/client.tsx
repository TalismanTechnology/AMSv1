"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, User } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DeleteAccountSection } from "@/components/account/delete-account-section";
import { AiConsentSection } from "@/components/account/ai-consent-section";
import { NotificationsSection } from "@/components/account/notifications-section";
import { hasAiConsent } from "@/lib/ai/consent";
import { updateProfile } from "@/actions/profile";
import { addChild, updateChild, removeChild } from "@/actions/children";
import { toast } from "sonner";
import {
  GRADES,
  GRADE_VALUES,
  formatGrade,
  formatRollover,
  type Rollover,
} from "@/lib/grades";
import type { Profile, Child } from "@/lib/types";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useLocale } from "@/components/i18n/locale-provider";
import type { MessageKey, Translate } from "@/lib/i18n/translate";

/** A stored grade ("8", "K") for display; legacy free text as written. */
function gradeLabel(value: string, t: Translate): string {
  return GRADE_VALUES.includes(value)
    ? t(`parent.grade.${value}` as MessageKey)
    : formatGrade(value);
}

interface ProfileClientProps {
  profile: Profile;
  /** The parent's children (records), not React children. */
  initialChildren: Child[];
  email: string;
  schoolId: string;
  schoolSlug: string;
  schoolName: string | null;
  newDocumentPush: boolean;
  /** The school's date for moving grades up (settings, default July 1). */
  gradeRollover: Rollover;
}

export function ProfileClient({
  profile,
  initialChildren,
  email,
  schoolId,
  schoolName,
  newDocumentPush,
  gradeRollover,
}: ProfileClientProps) {
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [savingName, setSavingName] = useState(false);

  // Child management
  const [childDialogOpen, setChildDialogOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [childName, setChildName] = useState("");
  const [childGrade, setChildGrade] = useState("");
  const [savingChild, setSavingChild] = useState(false);
  const [deleteChildId, setDeleteChildId] = useState<string | null>(null);
  const [deletingChild, setDeletingChild] = useState(false);
  const { locale, t } = useLocale();
  const dateLocale = locale === "es" ? "es-US" : "en-US";
  // "July 1" / "1 de julio" (any year: the rollover day exists every year).
  const rolloverLabel =
    locale === "es"
      ? new Date(2025, gradeRollover.month - 1, gradeRollover.day).toLocaleDateString("es-US", {
          month: "long",
          day: "numeric",
        })
      : formatRollover(gradeRollover.month, gradeRollover.day);

  async function handleSaveName() {
    setSavingName(true);
    const result = await updateProfile({ full_name: fullName });
    if (result.error) toast.error(result.error);
    else toast.success(t("parent.profile.nameUpdated"));
    setSavingName(false);
  }

  function openAddChild() {
    setEditingChild(null);
    setChildName("");
    setChildGrade("");
    setChildDialogOpen(true);
  }

  function openEditChild(child: Child) {
    setEditingChild(child);
    setChildName(child.name);
    setChildGrade(child.grade);
    setChildDialogOpen(true);
  }

  async function handleSaveChild() {
    if (!childName.trim() || !childGrade) return;
    setSavingChild(true);

    if (editingChild) {
      const result = await updateChild(editingChild.id, {
        name: childName.trim(),
        grade: childGrade,
      }, schoolId);
      if (result.error) toast.error(result.error);
      else {
        toast.success(t("parent.profile.childUpdated"));
        setChildDialogOpen(false);
      }
    } else {
      const formData = new FormData();
      formData.set("name", childName.trim());
      formData.set("grade", childGrade);
      formData.set("school_id", schoolId);
      const result = await addChild(formData);
      if (result.error) toast.error(result.error);
      else {
        toast.success(t("parent.profile.childAdded"));
        setChildDialogOpen(false);
      }
    }
    setSavingChild(false);
  }

  async function handleDeleteChild() {
    if (!deleteChildId) return;
    setDeletingChild(true);
    const result = await removeChild(deleteChildId, schoolId);
    if (result.error) toast.error(result.error);
    else toast.success(t("parent.profile.childRemoved"));
    setDeletingChild(false);
    setDeleteChildId(null);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-6 md:px-8 md:pb-16 md:pt-12">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
          {t("parent.profile.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("parent.profile.subtitle")}
        </p>
      </header>

      <div className="space-y-10">
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
            {t("parent.profile.personalInfo")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("parent.profile.personalInfoHint")}
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full-name">{t("parent.profile.fullName")}</Label>
            <div className="flex gap-2">
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("parent.profile.namePlaceholder")}
              />
              <Button
                onClick={handleSaveName}
                disabled={
                  savingName || fullName.trim() === (profile.full_name || "")
                }
              >
                {savingName && (
                  <LogoSpinner className="mr-2" />
                )}
                {t("parent.action.save")}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("parent.profile.email")}</Label>
            <Input value={email} disabled className="opacity-60" />
          </div>
          <div className="text-xs text-muted-foreground">
            {t("parent.profile.joined", {
              date: new Date(profile.created_at).toLocaleDateString(dateLocale, {
                month: "long",
                day: "numeric",
                year: "numeric",
              }),
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
            {t("parent.profile.language")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("parent.profile.languageHint")}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
          <span className="text-sm font-medium text-ink">{t("parent.profile.languageRow")}</span>
          <LanguageToggle className="text-sm" />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
              {t("parent.profile.children")}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("parent.profile.childrenHint", { date: rolloverLabel })}
            </p>
          </div>
          <Button size="sm" onClick={openAddChild} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />
            {t("parent.profile.addChild")}
          </Button>
        </div>
        <div>
          {initialChildren.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
              <User className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("parent.profile.noChildren")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {initialChildren.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-sm font-medium text-ink">
                      {child.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="flex items-center gap-2 font-medium text-ink">
                        {child.name}
                        {child.graduated_at && (
                          <Badge variant="secondary" className="text-xs">
                            {t("parent.profile.graduated")}
                          </Badge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {child.graduated_at ? null : gradeLabel(child.grade, t)}
                        {child.class_year != null && (
                          <span className="text-muted-foreground/70">
                            {child.graduated_at ? "" : " · "}
                            {t("parent.profile.classOf", { year: child.class_year })}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditChild(child)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteChildId(child.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <NotificationsSection
        newDocumentPush={newDocumentPush}
        schoolName={schoolName}
      />

      <AiConsentSection
        consented={hasAiConsent(profile)}
        consentedAt={profile.ai_consent_at}
      />

      <DeleteAccountSection />

      <Dialog open={childDialogOpen} onOpenChange={setChildDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingChild ? t("parent.profile.editChild") : t("parent.profile.addChild")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="child-name">{t("parent.profile.childName")}</Label>
              <Input
                id="child-name"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder={t("parent.profile.childNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="child-grade">{t("parent.profile.gradeLevel")}</Label>
              <Select value={childGrade} onValueChange={setChildGrade}>
                <SelectTrigger id="child-grade" aria-describedby="child-grade-hint">
                  <SelectValue placeholder={t("parent.profile.selectGrade")} />
                </SelectTrigger>
                <SelectContent>
                  {GRADES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {t(`parent.grade.${g.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="child-grade-hint" className="text-xs text-muted-foreground">
                {t("parent.profile.gradeHint")}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setChildDialogOpen(false)}
              >
                {t("parent.action.cancel")}
              </Button>
              <Button
                onClick={handleSaveChild}
                disabled={!childName.trim() || !childGrade || savingChild}
              >
                {savingChild && (
                  <LogoSpinner className="mr-2" />
                )}
                {editingChild ? t("parent.action.save") : t("parent.profile.add")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteChildId}
        onOpenChange={(open) => {
          if (!open) setDeleteChildId(null);
        }}
        title={t("parent.profile.removeChildTitle")}
        description={t("parent.profile.removeChildDescription")}
        confirmLabel={t("parent.profile.remove")}
        cancelLabel={t("parent.action.cancel")}
        variant="destructive"
        loading={deletingChild}
        onConfirm={handleDeleteChild}
      />
      </div>
    </div>
  );
}
