"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogoSpinner } from "@/components/logo-spinner";
import { Logo } from "@/components/logo";
import { GRADES } from "@/lib/grades";
import { completeOnboarding, skipChildrenPrompt } from "@/actions/onboarding";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useLocale } from "@/components/i18n/locale-provider";
import { localizeAuthError, schoolPossessiveFor } from "@/lib/i18n/auth-errors";
import type { MessageKey } from "@/lib/i18n/translate";

interface WelcomeFormProps {
  schoolId: string;
  schoolSlug: string;
  schoolName: string;
  /** Name on the school's Blackbaud roster, when the school gates on it. */
  rosterName: string | null;
  fallbackName: string | null;
  /** Already through first run — back here because they have no children on file. */
  returning: boolean;
}

/** Display label per stored grade value (lib/grades.ts); values never change. */
const GRADE_LABEL_KEYS: Record<string, MessageKey> = {
  "Pre-K": "auth.grade.preK",
  K: "auth.grade.k",
  "1": "auth.grade.1",
  "2": "auth.grade.2",
  "3": "auth.grade.3",
  "4": "auth.grade.4",
  "5": "auth.grade.5",
  "6": "auth.grade.6",
  "7": "auth.grade.7",
  "8": "auth.grade.8",
  "9": "auth.grade.9",
  "10": "auth.grade.10",
  "11": "auth.grade.11",
  "12": "auth.grade.12",
};

interface ChildDraft {
  key: number;
  name: string;
  grade: string;
}

export function WelcomeForm({
  schoolId,
  schoolSlug,
  schoolName,
  rosterName,
  fallbackName,
  returning,
}: WelcomeFormProps) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const [children, setChildren] = useState<ChildDraft[]>([
    { key: 0, name: "", grade: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const matchedName = rosterName ?? fallbackName;
  // The matched name is bold, so the sentence is split around {name}.
  const [matchedBefore, matchedAfter = ""] = t("auth.welcome.matched", {
    possessive: schoolPossessiveFor(locale, schoolName),
  }).split("{name}");

  function updateChild(key: number, patch: Partial<ChildDraft>) {
    setChildren((current) =>
      current.map((child) => (child.key === key ? { ...child, ...patch } : child))
    );
  }

  function addChild() {
    setChildren((current) => [
      ...current,
      { key: Math.max(...current.map((c) => c.key)) + 1, name: "", grade: "" },
    ]);
  }

  function removeChild(key: number) {
    setChildren((current) => current.filter((child) => child.key !== key));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const filled = children.filter(
      (child) => child.name.trim() !== "" && child.grade !== ""
    );

    if (filled.length === 0) {
      setError(t("auth.welcome.atLeastOne"));
      return;
    }

    setSaving(true);

    const result = await completeOnboarding({
      schoolId,
      children: filled.map((child) => ({
        name: child.name.trim(),
        grade: child.grade,
      })),
    });

    if (result.error) {
      setError(localizeAuthError(result.error, locale));
      setSaving(false);
      return;
    }

    router.replace(`/s/${schoolSlug}/parent/chat`);
  }

  // Not a hard wall: a parent without children here (or App Review) can go
  // straight in. They're asked again next session while they still have none.
  async function handleSkip() {
    setError(null);
    setSkipping(true);
    await skipChildrenPrompt();
    router.replace(`/s/${schoolSlug}/parent/chat`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
      <div className="metallic-card rounded-2xl p-8 sm:p-10">
        <div className="mb-5 flex items-start justify-between gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary elev-1">
            <Logo size={24} className="text-primary" />
          </span>
          <LanguageToggle />
        </div>

        <p className="eyebrow">
          {returning ? t("auth.welcome.eyebrowReturning") : t("auth.welcome.eyebrow")}
        </p>
        <h1 className="mt-2 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
          {returning
            ? t("auth.welcome.addChildren")
            : schoolName.trim()
              ? t("auth.welcome.inAt", { school: schoolName.trim() })
              : t("auth.welcome.in")}
        </h1>

        {matchedName && !returning && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-sm text-ink-soft">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              {matchedBefore}
              <span className="font-medium text-ink">{matchedName}</span>
              {matchedAfter}
            </span>
          </p>
        )}

        <p className="mt-6 text-sm leading-relaxed text-ink-soft">
          {t("auth.welcome.intro")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("auth.welcome.gradeNote")}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {children.map((child, index) => (
            <div key={child.key} className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor={`child-name-${child.key}`}>
                  {index === 0
                    ? t("auth.welcome.childName")
                    : t("auth.welcome.childNumber", { number: index + 1 })}
                </Label>
                <Input
                  id={`child-name-${child.key}`}
                  value={child.name}
                  onChange={(event) =>
                    updateChild(child.key, { name: event.target.value })
                  }
                  placeholder={t("auth.welcome.namePlaceholder")}
                />
              </div>

              {/* gap, not space-y: Radix renders a hidden <select> as the last child,
                  so space-y would give the trigger a bottom margin and lift
                  this column out of line with the name field. */}
              <div className="flex w-40 flex-col gap-2">
                <Label htmlFor={`child-grade-${child.key}`}>{t("auth.welcome.gradeLevel")}</Label>
                <Select
                  value={child.grade}
                  onValueChange={(value) =>
                    updateChild(child.key, { grade: value })
                  }
                >
                  <SelectTrigger id={`child-grade-${child.key}`}>
                    <SelectValue placeholder={t("auth.welcome.selectGrade")} />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((grade) => (
                      <SelectItem key={grade.value} value={grade.value}>
                        {GRADE_LABEL_KEYS[grade.value]
                          ? t(GRADE_LABEL_KEYS[grade.value])
                          : grade.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {children.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mb-0.5 shrink-0"
                  onClick={() => removeChild(child.key)}
                  aria-label={t("auth.welcome.removeChild", { number: index + 1 })}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={addChild}
            disabled={children.length >= 12}
          >
            <Plus className="mr-2 size-4" />
            {t("auth.welcome.addAnother")}
          </Button>

          {error && (
            <p aria-live="polite" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={saving || skipping}>
            {saving && <LogoSpinner className="mr-2" />}
            {t("auth.continue")}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-ink-soft"
            onClick={handleSkip}
            disabled={saving || skipping}
          >
            {skipping && <LogoSpinner className="mr-2" />}
            {t("auth.welcome.skip")}
          </Button>
        </form>
      </div>
    </main>
  );
}
