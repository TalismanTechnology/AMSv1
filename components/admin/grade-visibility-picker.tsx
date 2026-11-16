"use client";

import { Lock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GRADE_VALUES } from "@/lib/grades";
import { formatVisibleGrades, sortGrades } from "@/lib/documents/grade-visibility";
import { cn } from "@/lib/utils";

// Who may see something: all parents, or parents with a child in selected
// grades (Pre-K, K, 1–12). Used for intake addresses and documents. `value`
// null = all parents; [] while "Selected grades" has nothing picked yet.
export function GradeVisibilityPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  idPrefix: string;
}) {
  const restricted = value !== null;

  function toggle(grade: string) {
    const current = value ?? [];
    onChange(
      sortGrades(current.includes(grade) ? current.filter((g) => g !== grade) : [...current, grade])
    );
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" className="grid grid-cols-2 gap-2">
        <ModeButton
          id={`${idPrefix}-all`}
          selected={!restricted}
          onClick={() => onChange(null)}
          icon={<Users className="h-4 w-4" />}
          label="All parents"
        />
        <ModeButton
          id={`${idPrefix}-grades`}
          selected={restricted}
          onClick={() => onChange(value ?? [])}
          icon={<Lock className="h-4 w-4" />}
          label="Selected grades"
        />
      </div>
      {restricted && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" aria-label="Grades">
            {GRADE_VALUES.map((grade) => {
              const on = value.includes(grade);
              return (
                <button
                  key={grade}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(grade)}
                  className={cn(
                    "min-w-10 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    on
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {grade}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {value.length
              ? `${formatVisibleGrades(value)}: only parents with a child in these grades can see it. Parents with no children on file can't.`
              : "Pick at least one grade."}
          </p>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  id,
  selected,
  onClick,
  icon,
  label,
}: {
  id: string;
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
        selected
          ? "border-primary bg-primary/5 text-ink"
          : "border-border text-muted-foreground hover:bg-accent"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** A small badge for restricted items; nothing for all parents. */
export function GradeVisibilityBadge({
  grades,
  className,
}: {
  grades: string[] | null | undefined;
  className?: string;
}) {
  if (!grades?.length) return null;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 whitespace-nowrap font-normal text-ink-soft", className)}
      title="Only parents with a child in these grades can see this"
    >
      <Lock className="h-3 w-3" />
      {formatVisibleGrades(grades)}
    </Badge>
  );
}
