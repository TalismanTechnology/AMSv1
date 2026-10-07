"use client";

import { useState } from "react";
import { GraduationCap, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createCategory, deleteCategory } from "@/actions/categories";
import { setUpDivisionCategories } from "@/actions/sorting";
import {
  STARTER_CATEGORIES,
  WHOLE_SCHOOL,
  groupCategories,
  hasDivisionCategories,
} from "@/lib/documents/division-categories";
import { toast } from "sonner";
import type { Category, EventCalendar } from "@/lib/types";

const PRESET_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#64748b",
];

/** The group select's value for the whole school, which has no division id. */
const WHOLE = "whole";

interface CategoryManagerProps {
  categories: Category[];
  divisions: EventCalendar[];
  /** How many documents the switch to division categories would re-sort. */
  documentCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  /** Called with the unfiled documents once division categories are set up. */
  onSetUp: (unfiledIds: string[]) => void;
}

export function CategoryManager({
  categories,
  divisions,
  documentCount,
  open,
  onOpenChange,
  schoolId,
  onSetUp,
}: CategoryManagerProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [group, setGroup] = useState(WHOLE);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmSetUp, setConfirmSetUp] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  const grouped = hasDivisionCategories(categories);
  const groups = groupCategories(categories, divisions);

  async function handleCreate() {
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("description", description);
    formData.set("color", color);
    if (grouped && group !== WHOLE) formData.set("division_id", group);
    const result = await createCategory(schoolId, formData);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Category created");
      setName("");
      setDescription("");
      setColor(PRESET_COLORS[0]);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    const result = await deleteCategory(deleteId, schoolId);
    if (result.error) toast.error(result.error);
    else toast.success("Category deleted");
    setDeleting(false);
    setDeleteId(null);
  }

  async function handleSetUp() {
    setSettingUp(true);
    const result = await setUpDivisionCategories(schoolId);
    setSettingUp(false);
    setConfirmSetUp(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Division categories are set up");
    onOpenChange(false);
    onSetUp(result.unfiledIds ?? []);
  }

  const starterNames = STARTER_CATEGORIES.map((c) => c.name).join(", ");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
              Manage Categories
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!grouped && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  <GraduationCap className="h-4 w-4" />
                  Sort by division
                </div>
                <p className="text-sm text-muted-foreground">
                  Lower, Middle and Upper School and the whole school each get
                  the same categories: {starterNames}. Mail sent to a
                  division&apos;s email address is filed into that division.
                </p>
                <Button size="sm" onClick={() => setConfirmSetUp(true)}>
                  Set up division categories
                </Button>
              </div>
            )}

            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.divisionId ?? WHOLE}>
                  {grouped && (
                    <p className="mb-1 px-3 text-xs font-medium text-muted-foreground">
                      {g.name}
                    </p>
                  )}
                  {g.categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between rounded-xl px-3 py-1.5 transition-colors hover:bg-muted/40"
                    >
                      <Badge
                        style={{
                          backgroundColor: cat.color + "20",
                          color: cat.color,
                        }}
                      >
                        {cat.name}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${grouped ? `${g.name} · ` : ""}${cat.name}`}
                        className="h-8 w-8 p-0 text-muted-foreground/70 hover:text-destructive"
                        onClick={() => setDeleteId(cat.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              {categories.length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-base font-semibold text-ink">
                    No categories yet
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Set up division categories, or add your own below.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <Label className="text-sm text-muted-foreground">Add a category</Label>
              {grouped && (
                <Select value={group} onValueChange={setGroup}>
                  <SelectTrigger aria-label="Division">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {divisions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={WHOLE}>{WHOLE_SCHOOL}</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Category name"
              />
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What belongs here (helps the AI sort)"
              />
              <div className="flex gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-all",
                      color === c
                        ? "scale-110 border-foreground"
                        : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button onClick={handleCreate} disabled={!name.trim()} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add category
                </Button>
                {grouped && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setConfirmSetUp(true)}
                  >
                    Start over with the starter categories
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete category"
        description="Are you sure you want to delete this category? Documents with this category will become uncategorized."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={confirmSetUp}
        onOpenChange={setConfirmSetUp}
        title="Replace your categories?"
        description={`Your ${categories.length} current categories are deleted and replaced with ${STARTER_CATEGORIES.length} for each division and for the whole school. Then AI files your ${documentCount} documents into them again. Documents themselves are not deleted.`}
        confirmLabel="Replace and re-sort"
        variant="destructive"
        loading={settingUp}
        onConfirm={handleSetUp}
      />
    </>
  );
}
