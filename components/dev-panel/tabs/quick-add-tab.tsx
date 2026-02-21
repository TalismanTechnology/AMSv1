"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Check, FileText, CalendarDays, Megaphone, Tag } from "lucide-react";
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
import { generateBulkDocuments, type BulkDocumentRow } from "@/actions/dev-panel";
import { createEvent } from "@/actions/events";
import { createAnnouncement } from "@/actions/announcements";
import { createCategory } from "@/actions/categories";

interface QuickAddTabProps {
  schoolId: string;
}

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-accent/50 transition-colors rounded-lg"
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-left">{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t px-3 pb-3 pt-3 space-y-3">{children}</div>}
    </div>
  );
}

function QuickDocument({ schoolId }: { schoolId: string }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    const fd = new FormData(e.currentTarget);
    const row: BulkDocumentRow = {
      title: fd.get("title") as string,
      description: fd.get("description") as string,
      file_name: `${(fd.get("title") as string).toLowerCase().replace(/\s+/g, "-")}.pdf`,
      file_type: "pdf",
      tags: (fd.get("tags") as string).split(",").map((t) => t.trim()).filter(Boolean),
    };

    const result = await generateBulkDocuments(schoolId, [row]);
    setLoading(false);
    if (result.success) {
      setSuccess(true);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(false), 2000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div>
        <Label htmlFor="doc-title" className="text-xs">Title</Label>
        <Input id="doc-title" name="title" required placeholder="Student Handbook" className="h-8 text-sm mt-1" />
      </div>
      <div>
        <Label htmlFor="doc-desc" className="text-xs">Description</Label>
        <Textarea id="doc-desc" name="description" placeholder="Brief description..." className="text-sm min-h-[60px] mt-1" />
      </div>
      <div>
        <Label htmlFor="doc-tags" className="text-xs">Tags (comma-separated)</Label>
        <Input id="doc-tags" name="tags" placeholder="policies, handbook" className="h-8 text-sm mt-1" />
      </div>
      <Button type="submit" size="sm" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : success ? <Check className="h-3.5 w-3.5" /> : "Add Document"}
      </Button>
    </form>
  );
}

function QuickEvent({ schoolId }: { schoolId: string }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    const fd = new FormData(e.currentTarget);
    const result = await createEvent(schoolId, fd);
    setLoading(false);
    if (result.success) {
      setSuccess(true);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(false), 2000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div>
        <Label htmlFor="evt-title" className="text-xs">Title</Label>
        <Input id="evt-title" name="title" required placeholder="Science Fair" className="h-8 text-sm mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="evt-date" className="text-xs">Date</Label>
          <Input id="evt-date" name="date" type="date" required className="h-8 text-sm mt-1" />
        </div>
        <div>
          <Label htmlFor="evt-type" className="text-xs">Type</Label>
          <Select name="event_type" defaultValue="general">
            <SelectTrigger className="h-8 text-sm mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["general", "academic", "sports", "arts", "meeting", "holiday", "other"].map((t) => (
                <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="evt-location" className="text-xs">Location</Label>
        <Input id="evt-location" name="location" placeholder="Main Auditorium" className="h-8 text-sm mt-1" />
      </div>
      <Button type="submit" size="sm" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : success ? <Check className="h-3.5 w-3.5" /> : "Add Event"}
      </Button>
    </form>
  );
}

function QuickAnnouncement({ schoolId }: { schoolId: string }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    const fd = new FormData(e.currentTarget);
    const result = await createAnnouncement(schoolId, fd);
    setLoading(false);
    if (result.success) {
      setSuccess(true);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(false), 2000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div>
        <Label htmlFor="ann-title" className="text-xs">Title</Label>
        <Input id="ann-title" name="title" required placeholder="Important Update" className="h-8 text-sm mt-1" />
      </div>
      <div>
        <Label htmlFor="ann-content" className="text-xs">Content</Label>
        <Textarea id="ann-content" name="content" required placeholder="Announcement content..." className="text-sm min-h-[60px] mt-1" />
      </div>
      <div>
        <Label htmlFor="ann-priority" className="text-xs">Priority</Label>
        <Select name="priority" defaultValue="normal">
          <SelectTrigger className="h-8 text-sm mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="important">Important</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : success ? <Check className="h-3.5 w-3.5" /> : "Add Announcement"}
      </Button>
    </form>
  );
}

function QuickCategory({ schoolId }: { schoolId: string }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);

    const fd = new FormData(e.currentTarget);
    const result = await createCategory(schoolId, fd);
    setLoading(false);
    if (result.success) {
      setSuccess(true);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(false), 2000);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div>
        <Label htmlFor="cat-name" className="text-xs">Name</Label>
        <Input id="cat-name" name="name" required placeholder="Academic Policies" className="h-8 text-sm mt-1" />
      </div>
      <div>
        <Label htmlFor="cat-color" className="text-xs">Color</Label>
        <Input id="cat-color" name="color" type="color" defaultValue="#6366f1" className="h-8 w-full mt-1" />
      </div>
      <Button type="submit" size="sm" disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : success ? <Check className="h-3.5 w-3.5" /> : "Add Category"}
      </Button>
    </form>
  );
}

export function QuickAddTab({ schoolId }: QuickAddTabProps) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold metallic-text mb-1">Quick Add</h3>
        <p className="text-xs text-muted-foreground">
          Add individual items with minimal fields.
        </p>
      </div>

      <CollapsibleSection title="Document" icon={FileText} defaultOpen>
        <QuickDocument schoolId={schoolId} />
      </CollapsibleSection>

      <CollapsibleSection title="Event" icon={CalendarDays}>
        <QuickEvent schoolId={schoolId} />
      </CollapsibleSection>

      <CollapsibleSection title="Announcement" icon={Megaphone}>
        <QuickAnnouncement schoolId={schoolId} />
      </CollapsibleSection>

      <CollapsibleSection title="Category" icon={Tag}>
        <QuickCategory schoolId={schoolId} />
      </CollapsibleSection>
    </div>
  );
}
