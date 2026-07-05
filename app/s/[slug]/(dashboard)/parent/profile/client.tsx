"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, User } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { updateProfile } from "@/actions/profile";
import { addChild, updateChild, removeChild } from "@/actions/children";
import { toast } from "sonner";
import type { Profile, Child } from "@/lib/types";

const GRADES = [
  { value: "Pre-K", label: "Pre-K" },
  { value: "K", label: "Kindergarten" },
  { value: "1", label: "1st Grade" },
  { value: "2", label: "2nd Grade" },
  { value: "3", label: "3rd Grade" },
  { value: "4", label: "4th Grade" },
  { value: "5", label: "5th Grade" },
  { value: "6", label: "6th Grade" },
  { value: "7", label: "7th Grade" },
  { value: "8", label: "8th Grade" },
  { value: "9", label: "9th Grade" },
  { value: "10", label: "10th Grade" },
  { value: "11", label: "11th Grade" },
  { value: "12", label: "12th Grade" },
];

interface ProfileClientProps {
  profile: Profile;
  children: Child[];
  email: string;
  schoolId: string;
  schoolSlug: string;
}

export function ProfileClient({
  profile,
  children: initialChildren,
  email,
  schoolId,
  schoolSlug,
}: ProfileClientProps) {
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [savingName, setSavingName] = useState(false);

  // Child management
  const [childDialogOpen, setChildDialogOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [childName, setChildName] = useState("");
  const [childGrade, setChildGrade] = useState("");
  const [savingChild, setSavingChild] = useState(false);
  const [deleteChildId, setDeleteChildId] = useState<string | null>(null);
  const [deletingChild, setDeletingChild] = useState(false);

  async function handleSaveName() {
    setSavingName(true);
    const result = await updateProfile({ full_name: fullName });
    if (result.error) toast.error(result.error);
    else toast.success("Name updated");
    setSavingName(false);
  }

  function openAddChild() {
    setEditingChild(null);
    setChildName("");
    setChildGrade("");
    setChildDialogOpen(true);
  }

  function openEditChild(child: Child) {
    setEditingChild(child);
    setChildName(child.name);
    setChildGrade(child.grade);
    setChildDialogOpen(true);
  }

  async function handleSaveChild() {
    if (!childName.trim() || !childGrade) return;
    setSavingChild(true);

    if (editingChild) {
      const result = await updateChild(editingChild.id, {
        name: childName.trim(),
        grade: childGrade,
      }, schoolId);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Child updated");
        setChildDialogOpen(false);
      }
    } else {
      const formData = new FormData();
      formData.set("name", childName.trim());
      formData.set("grade", childGrade);
      formData.set("school_id", schoolId);
      const result = await addChild(formData);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Child added");
        setChildDialogOpen(false);
      }
    }
    setSavingChild(false);
  }

  async function handleDeleteChild() {
    if (!deleteChildId) return;
    setDeletingChild(true);
    const result = await removeChild(deleteChildId, schoolId);
    if (result.error) toast.error(result.error);
    else toast.success("Child removed");
    setDeletingChild(false);
    setDeleteChildId(null);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-12 md:px-8">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
          Profile
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your details and your children.
        </p>
      </header>

      <div className="space-y-10">
      <section>
        <div className="mb-4">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
            Personal Information
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage your account details.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full-name">Full Name</Label>
            <div className="flex gap-2">
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
              <Button
                onClick={handleSaveName}
                disabled={
                  savingName || fullName.trim() === (profile.full_name || "")
                }
              >
                {savingName && (
                  <LogoSpinner className="mr-2" />
                )}
                Save
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} disabled className="opacity-60" />
          </div>
          <div className="text-xs text-muted-foreground">
            Joined{" "}
            {new Date(profile.created_at).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
              Children
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage your children&apos;s information.
            </p>
          </div>
          <Button size="sm" onClick={openAddChild} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />
            Add child
          </Button>
        </div>
        <div>
          {initialChildren.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
              <User className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No children added yet. Click &quot;Add child&quot; to get started.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {initialChildren.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-sm font-medium text-ink">
                      {child.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-medium text-ink">{child.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {child.grade}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditChild(child)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteChildId(child.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Dialog open={childDialogOpen} onOpenChange={setChildDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingChild ? "Edit child" : "Add child"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="child-name">Name</Label>
              <Input
                id="child-name"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="Child's name"
              />
            </div>
            <div className="space-y-2">
              <Label>Grade</Label>
              <Select value={childGrade} onValueChange={setChildGrade}>
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {GRADES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setChildDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveChild}
                disabled={!childName.trim() || !childGrade || savingChild}
              >
                {savingChild && (
                  <LogoSpinner className="mr-2" />
                )}
                {editingChild ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteChildId}
        onOpenChange={(open) => {
          if (!open) setDeleteChildId(null);
        }}
        title="Remove child"
        description="Are you sure you want to remove this child? This action cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        loading={deletingChild}
        onConfirm={handleDeleteChild}
      />
      </div>
    </div>
  );
}
