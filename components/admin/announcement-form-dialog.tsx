"use client";

import { useState } from "react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { createAnnouncement, updateAnnouncement } from "@/actions/announcements";
import { toast } from "sonner";
import type { Announcement } from "@/lib/types";

interface AnnouncementFormDialogProps {
  announcement?: Announcement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
}

export function AnnouncementFormDialog({
  announcement,
  open,
  onOpenChange,
  schoolId,
}: AnnouncementFormDialogProps) {
  const isEditing = !!announcement;
  const [title, setTitle] = useState(announcement?.title || "");
  const [content, setContent] = useState(announcement?.content || "");
  const [priority, setPriority] = useState(announcement?.priority || "normal");
  const [pinned, setPinned] = useState(announcement?.pinned || false);
  const [indefinite, setIndefinite] = useState(
    isEditing ? !announcement?.expires_at : false
  );
  const defaultExpiry = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  };
  const [expiresAt, setExpiresAt] = useState(
    announcement?.expires_at?.split("T")[0] || defaultExpiry()
  );
  const [publishMode, setPublishMode] = useState<"now" | "scheduled">(
    (announcement as Announcement & { status?: string })?.status === "scheduled"
      ? "scheduled"
      : "now"
  );
  const [publishAt, setPublishAt] = useState(
    (announcement as Announcement & { publish_at?: string })?.publish_at?.slice(0, 16) || ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);

    if (isEditing) {
      const result = await updateAnnouncement(announcement.id, schoolId, {
        title: title.trim(),
        content: content.trim(),
        priority,
        pinned,
        expires_at: indefinite ? null : expiresAt || null,
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success("Announcement updated");
        onOpenChange(false);
      }
    } else {
      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("content", content.trim());
      formData.set("priority", priority);
      formData.set("pinned", String(pinned));
      formData.set("indefinite", String(indefinite));
      formData.set("expires_at", indefinite ? "" : expiresAt);
      formData.set("publish_mode", publishMode);
      formData.set("publish_at", publishAt);
      const result = await createAnnouncement(schoolId, formData);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Announcement created");
        setTitle("");
        setContent("");
        setPriority("normal");
        setPinned(false);
        setIndefinite(false);
        setExpiresAt(defaultExpiry());
        onOpenChange(false);
      }
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit announcement" : "Create announcement"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. School Closure Notice"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ann-content">Content</Label>
            <Textarea
              id="ann-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Write the announcement content..."
            />
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority as (value: string) => void}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="important">Important</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={indefinite}
              onCheckedChange={setIndefinite}
              id="ann-indefinite"
            />
            <Label htmlFor="ann-indefinite">Indefinite (no expiration)</Label>
          </div>

          {!indefinite && (
            <div className="space-y-2">
              <Label htmlFor="ann-expires">Expires on</Label>
              <Input
                id="ann-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Defaults to 1 week from today. Expired announcements are automatically removed.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Switch
              checked={pinned}
              onCheckedChange={setPinned}
              id="ann-pinned"
            />
            <Label htmlFor="ann-pinned">Pin to top</Label>
          </div>

          <div className="space-y-2">
            <Label>Publish</Label>
            <Select value={publishMode} onValueChange={(v) => setPublishMode(v as "now" | "scheduled")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="now">Publish immediately</SelectItem>
                <SelectItem value="scheduled">Schedule for later</SelectItem>
              </SelectContent>
            </Select>
            {publishMode === "scheduled" && (
              <Input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!title.trim() || !content.trim() || saving}
            >
              {saving && <LogoSpinner className="mr-2" />}
              {isEditing ? "Save changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
