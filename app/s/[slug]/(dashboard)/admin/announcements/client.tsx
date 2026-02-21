"use client";

import { useState } from "react";
import {
  Plus,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Trash2,
  Pin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AnnouncementFormDialog } from "@/components/admin/announcement-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MagicBentoCard } from "@/components/magic-bento";
import { deleteAnnouncement } from "@/actions/announcements";
import { toast } from "sonner";
import type { Announcement, AnnouncementPriority } from "@/lib/types";

const PRIORITY_COLORS: Record<AnnouncementPriority, string> = {
  normal: "bg-secondary text-secondary-foreground",
  important: "bg-chart-1/15 text-chart-1",
  urgent: "bg-destructive/15 text-destructive",
};

interface AnnouncementsClientProps {
  announcements: Announcement[];
  schoolId: string;
  schoolSlug: string;
}

export function AnnouncementsClient({
  announcements,
  schoolId,
  schoolSlug,
}: AnnouncementsClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] =
    useState<Announcement | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    const result = await deleteAnnouncement(deleteId, schoolId);
    if (result.error) toast.error(result.error);
    else toast.success("Announcement deleted");
    setDeleting(false);
    setDeleteId(null);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
          <p className="text-sm text-muted-foreground">
            {announcements.length} announcement
            {announcements.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create announcement
        </Button>
      </div>

      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-16">
          <Megaphone className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">
            No announcements yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first announcement to notify parents.
          </p>
        </div>
      ) : (
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-lg">
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="hidden md:table-cell">Pinned</TableHead>
                <TableHead className="hidden md:table-cell">Expires</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.title}</p>
                  </TableCell>
                  <TableCell>
                    <Badge className={PRIORITY_COLORS[a.priority]}>
                      {a.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {a.pinned && (
                      <Pin className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {a.expires_at ? formatDate(a.expires_at) : "\u2014"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {formatDate(a.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditingAnnouncement(a)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(a.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </MagicBentoCard>
      )}

      <AnnouncementFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        schoolId={schoolId}
      />

      {editingAnnouncement && (
        <AnnouncementFormDialog
          announcement={editingAnnouncement}
          open={!!editingAnnouncement}
          onOpenChange={(open) => {
            if (!open) setEditingAnnouncement(null);
          }}
          schoolId={schoolId}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete announcement"
        description="Are you sure you want to delete this announcement? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
