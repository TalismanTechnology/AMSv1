"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createSchool, assignSchoolAdmin, updateSchool, deleteSchool } from "@/actions/super-admin";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import type { School } from "@/lib/types";

interface SchoolWithCount extends School {
  school_memberships: { count: number }[];
}

export function SuperAdminClient({
  schools: initialSchools,
}: {
  schools: SchoolWithCount[];
}) {
  const [schools, setSchools] = useState(initialSchools);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateSchool(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await createSchool(formData);
    if (result?.error) {
      setError(result.error);
    } else {
      setCreateOpen(false);
      // Refresh the page to get updated list
      window.location.reload();
    }
    setLoading(false);
  }

  async function handleUpdateSchool(schoolId: string) {
    setLoading(true);
    setError(null);
    const result = await updateSchool(schoolId, { name: editName, slug: editSlug });
    if (result?.error) {
      setError(result.error);
    } else {
      setEditOpen(null);
      setEditName("");
      setEditSlug("");
      toast.success("School updated");
      window.location.reload();
    }
    setLoading(false);
  }

  async function handleDeleteSchool() {
    if (!deleteId) return;
    setDeleting(true);
    const result = await deleteSchool(deleteId);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("School deleted");
      window.location.reload();
    }
    setDeleting(false);
    setDeleteId(null);
  }

  async function handleAssignAdmin(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await assignSchoolAdmin(formData);
    if (result?.error) {
      setError(result.error);
    } else {
      setAssignOpen(null);
      window.location.reload();
    }
    setLoading(false);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Schools</h2>
          <p className="text-muted-foreground">
            Manage all schools on the platform
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create School
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new school</DialogTitle>
              <DialogDescription>
                Enter the school details. You can assign an admin after creation.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreateSchool} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">School name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Lincoln Elementary"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">
                  URL slug
                </Label>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>askmyschool.com/s/</span>
                  <Input
                    id="slug"
                    name="slug"
                    placeholder="lincoln"
                    pattern="[a-z0-9-]+"
                    required
                    className="flex-1"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <LogoSpinner className="mr-2" />}
                Create School
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {schools.map((school) => (
          <Card key={school.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{school.name}</CardTitle>
                  <CardDescription>/s/{school.slug}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Dialog
                    open={editOpen === school.id}
                    onOpenChange={(open) => {
                      setEditOpen(open ? school.id : null);
                      if (open) {
                        setEditName(school.name);
                        setEditSlug(school.slug);
                        setError(null);
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit school</DialogTitle>
                        <DialogDescription>
                          Update the name or URL slug for {school.name}.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        {error && (
                          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                            {error}
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="edit-name">School name</Label>
                          <Input
                            id="edit-name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="School name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-slug">URL slug</Label>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>askmyschool.com/s/</span>
                            <Input
                              id="edit-slug"
                              value={editSlug}
                              onChange={(e) => setEditSlug(e.target.value.toLowerCase())}
                              placeholder="lincoln"
                              pattern="[a-z0-9-]+"
                              className="flex-1"
                            />
                          </div>
                        </div>
                        <Button
                          className="w-full"
                          disabled={loading || !editName.trim() || !editSlug.trim()}
                          onClick={() => handleUpdateSchool(school.id)}
                        >
                          {loading && (
                            <LogoSpinner className="mr-2" />
                          )}
                          Save
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog
                    open={assignOpen === school.id}
                    onOpenChange={(open) =>
                      setAssignOpen(open ? school.id : null)
                    }
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Assign Admin
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Assign admin to {school.name}</DialogTitle>
                        <DialogDescription>
                          Enter the email of an existing user to make them an admin of this school.
                        </DialogDescription>
                      </DialogHeader>
                      <form action={handleAssignAdmin} className="space-y-4">
                        {error && (
                          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                            {error}
                          </div>
                        )}
                        <input
                          type="hidden"
                          name="school_id"
                          value={school.id}
                        />
                        <div className="space-y-2">
                          <Label htmlFor="email">User email</Label>
                          <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="admin@school.com"
                            required
                          />
                        </div>
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={loading}
                        >
                          {loading && (
                            <LogoSpinner className="mr-2" />
                          )}
                          Assign Admin
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteId(school.id)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/s/${school.slug}/admin`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {school.school_memberships?.[0]?.count || 0} members
              </p>
            </CardContent>
          </Card>
        ))}

        {schools.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No schools yet. Create your first school to get started.
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Delete school"
        description="Are you sure you want to delete this school? All members, documents, settings, and associated data will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDeleteSchool}
      />
    </div>
  );
}
