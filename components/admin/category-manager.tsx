"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createCategory, deleteCategory } from "@/actions/categories";
import { toast } from "sonner";
import type { Category } from "@/lib/types";

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

interface CategoryManagerProps {
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
}

export function CategoryManager({
  categories,
  open,
  onOpenChange,
  schoolId,
}: CategoryManagerProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("description", description);
    formData.set("color", color);
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

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Labels</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
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
                  className="h-8 w-8 p-0 text-muted-foreground/70 hover:text-destructive"
                  onClick={() => setDeleteId(cat.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No categories yet.
              </p>
            )}
          </div>

          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-medium">Add new category</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
            />
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
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
            <Button
              onClick={handleCreate}
              disabled={!name.trim()}
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add category
            </Button>
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
    </>
  );
}
