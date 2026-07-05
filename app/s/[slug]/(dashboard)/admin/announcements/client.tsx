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
      <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
            Announcements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {announcements.length} announcement
            {announcements.length !== 1 ? "s" : ""} reaching your parent
            community.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Create announcement
        </Button>
      </header>

      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Megaphone className="mb-4 h-6 w-6 text-muted-foreground" />
          <h3 className="text-sm font-medium text-ink">
            No announcements yet
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first announcement to keep parents informed about
            what matters.
          </p>
        </div>
      ) : (
        <section>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium text-muted-foreground">
                  Title
                </TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">
                  Priority
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                  Pinned
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                  Expires
                </TableHead>
                <TableHead className="hidden text-xs font-medium text-muted-foreground md:table-cell">
                  Created
                </TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.map((a) => (
                <TableRow
                  key={a.id}
                  className="border-border transition-colors hover:bg-muted/40"
                >
                  <TableCell className="py-4">
                    <div className="flex items-center gap-2">
                      {a.pinned && (
                        <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground md:hidden" />
                      )}
                      <p className="font-medium text-ink">{a.title}</p>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge className={PRIORITY_COLORS[a.priority]}>
                      {a.priority}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden py-4 md:table-cell">
                    {a.pinned && <Pin className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="hidden py-4 text-sm text-muted-foreground md:table-cell">
                    {a.expires_at ? formatDate(a.expires_at) : "\u2014"}
                  </TableCell>
                  <TableCell className="hidden py-4 text-sm text-muted-foreground md:table-cell">
                    {formatDate(a.created_at)}
                  </TableCell>
                  <TableCell className="py-4">
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
        </section>
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
