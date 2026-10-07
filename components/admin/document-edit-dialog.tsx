"use client";

import { useState } from "react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { CalendarChipSelect } from "@/components/admin/calendar-chip-select";
import { updateDocument } from "@/actions/documents";
import { toast } from "sonner";
import type { Document, Category, Folder, EventCalendar } from "@/lib/types";

interface DocumentEditDialogProps {
  document: Document;
  categories: Category[];
  folders: Folder[];
  divisions: EventCalendar[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
}

export function DocumentEditDialog({
  document,
  categories,
  folders,
  divisions,
  open,
  onOpenChange,
  schoolId,
}: DocumentEditDialogProps) {
  const [title, setTitle] = useState(document.title);
  const [description, setDescription] = useState(document.description || "");
  const [categoryId, setCategoryId] = useState(document.category_id || "none");
  const [folderId, setFolderId] = useState(document.folder_id || "none");
  const [tags, setTags] = useState(document.tags.join(", "));
  const [divisionIds, setDivisionIds] = useState<string[]>(
    (document.divisions ?? []).map((d) => d.id)
  );
  const [saving, setSaving] = useState(false);

  function toggleDivision(id: string) {
    setDivisionIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateDocument(document.id, schoolId, {
      title,
      description: description || undefined,
      category_id: categoryId === "none" ? null : categoryId,
      folder_id: folderId === "none" ? null : folderId,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      division_ids: divisionIds,
    });
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Document updated");
      onOpenChange(false);
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
            Edit document
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="rounded-xl border border-border px-4 py-3">
            <p className="text-sm font-medium text-ink">{document.file_name}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {document.file_type}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-ink-soft">
              Title
            </Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-ink-soft">
              Description
            </Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-ink-soft">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-ink-soft">Folder</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger>
                <SelectValue placeholder="No folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No folder</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {divisions.length > 0 && (
            <div className="space-y-2">
              <Label className="text-ink-soft">Divisions</Label>
              <CalendarChipSelect
                items={divisions}
                kind="division"
                selected={divisionIds}
                onToggle={toggleDivision}
              />
              <p className="text-xs text-muted-foreground">
                The assistant only applies this document to the divisions
                picked here. Leave all off if it&apos;s for the whole school.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-ink-soft">Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="bg-primary text-primary-foreground"
            >
              {saving && <LogoSpinner className="mr-2" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
