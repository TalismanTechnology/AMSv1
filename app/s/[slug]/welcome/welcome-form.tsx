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
import { completeOnboarding } from "@/actions/onboarding";

interface WelcomeFormProps {
  schoolId: string;
  schoolSlug: string;
  schoolName: string;
  /** Name on the school's Blackbaud roster, when the school gates on it. */
  rosterName: string | null;
  fallbackName: string | null;
}

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
}: WelcomeFormProps) {
  const router = useRouter();
  const [children, setChildren] = useState<ChildDraft[]>([
    { key: 0, name: "", grade: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const matchedName = rosterName ?? fallbackName;

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
      setError("Add at least one child to continue.");
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
      setError(result.error);
      setSaving(false);
      return;
    }

    router.replace(`/s/${schoolSlug}/parent`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16">
      <div className="metallic-card rounded-2xl p-8 sm:p-10">
        <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary elev-1">
          <Logo size={24} className="text-primary" />
        </span>

        <p className="eyebrow">Welcome</p>
        <h1 className="mt-2 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
          You&apos;re in at {schoolName}
        </h1>

        {matchedName && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-sm text-ink-soft">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              We matched you to {schoolName}&apos;s records as{" "}
              <span className="font-medium text-ink">{matchedName}</span>. If
              that isn&apos;t you, contact the school office before continuing.
            </span>
          </p>
        )}

        <p className="mt-6 text-sm leading-relaxed text-ink-soft">
          Tell us who your children are so answers can be tailored to their
          grade. You can change this later in your profile.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {children.map((child, index) => (
            <div key={child.key} className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`child-name-${child.key}`}>
                  {index === 0 ? "Child's name" : `Child ${index + 1}`}
                </Label>
                <Input
                  id={`child-name-${child.key}`}
                  value={child.name}
                  onChange={(event) =>
                    updateChild(child.key, { name: event.target.value })
                  }
                  placeholder="First and last name"
                />
              </div>

              <div className="w-40 space-y-2">
                <Label htmlFor={`child-grade-${child.key}`}>Grade level</Label>
                <Select
                  value={child.grade}
                  onValueChange={(value) =>
                    updateChild(child.key, { grade: value })
                  }
                >
                  <SelectTrigger id={`child-grade-${child.key}`}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((grade) => (
                      <SelectItem key={grade.value} value={grade.value}>
                        {grade.label}
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
                  aria-label={`Remove child ${index + 1}`}
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
            Add another child
          </Button>

          {error && (
            <p aria-live="polite" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={saving}>
            {saving && <LogoSpinner className="mr-2" />}
            Continue
          </Button>
        </form>
      </div>
    </main>
  );
}
