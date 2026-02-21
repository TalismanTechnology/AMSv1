"use client";

import { useState } from "react";
import {
  FolderIcon,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  FileText,
  Trash2,
  Pencil,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createFolder, renameFolder, deleteFolder } from "@/actions/folders";
import { toast } from "sonner";
import type { Folder } from "@/lib/types";

function buildTree(folders: Folder[]): (Folder & { children: Folder[] })[] {
  const map = new Map<string, Folder & { children: Folder[] }>();
  const roots: (Folder & { children: Folder[] })[] = [];

  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  folders.forEach((f) => {
    const node = map.get(f.id)!;
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  schoolId: string;
}

export function FolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  schoolId,
}: FolderTreeProps) {
  const [creatingInParent, setCreatingInParent] = useState<string | null | false>(false);
  const [newName, setNewName] = useState("");
  const tree = buildTree(folders);

  async function handleCreate(parentId: string | null) {
    if (!newName.trim()) return;
    const result = await createFolder(schoolId, {
      name: newName.trim(),
      parent_id: parentId,
    });
    if (result.error) toast.error(result.error);
    else toast.success("Folder created");
    setNewName("");
    setCreatingInParent(false);
  }

  return (
    <div className="w-52 shrink-0 rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Folders
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setCreatingInParent(null)}
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      <button
        onClick={() => onSelectFolder(null)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
          selectedFolderId === null
            ? "bg-sidebar-accent font-medium text-primary"
            : "text-muted-foreground hover:bg-accent"
        )}
      >
        <FileText className="h-4 w-4" />
        All Documents
      </button>

      {tree.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          depth={0}
          selectedId={selectedFolderId}
          onSelect={onSelectFolder}
          onCreateIn={setCreatingInParent}
          schoolId={schoolId}
        />
      ))}

      {creatingInParent !== false && (
        <div className="mt-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Folder name"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate(creatingInParent);
              if (e.key === "Escape") {
                setCreatingInParent(false);
                setNewName("");
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

interface FolderNodeProps {
  folder: Folder & { children: Folder[] };
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreateIn: (parentId: string | null | false) => void;
  schoolId: string;
}

function FolderNode({
  folder,
  depth,
  selectedId,
  onSelect,
  onCreateIn,
  schoolId,
}: FolderNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const children = (folder as Folder & { children: Folder[] }).children || [];

  async function handleRename() {
    if (!name.trim() || name === folder.name) {
      setRenaming(false);
      setName(folder.name);
      return;
    }
    const result = await renameFolder(folder.id, schoolId, name.trim());
    if (result.error) toast.error(result.error);
    else toast.success("Folder renamed");
    setRenaming(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await deleteFolder(folder.id, schoolId);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Folder deleted");
        if (selectedId === folder.id) onSelect(null);
      }
    } catch {
      toast.error("Failed to delete folder");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-2 py-1 text-sm",
          selectedId === folder.id
            ? "bg-sidebar-accent font-medium text-primary"
            : "text-muted-foreground hover:bg-accent"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {children.length > 0 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        <FolderIcon className="h-4 w-4 shrink-0" />

        {renaming ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-6 text-sm px-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") {
                setRenaming(false);
                setName(folder.name);
              }
            }}
            onBlur={handleRename}
          />
        ) : (
          <button
            className="flex-1 truncate text-left"
            onClick={() => onSelect(folder.id)}
          >
            {folder.name}
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreateIn(folder.id)}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Add subfolder
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded &&
        children.map((child) => (
          <FolderNode
            key={child.id}
            folder={child as Folder & { children: Folder[] }}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onCreateIn={onCreateIn}
            schoolId={schoolId}
          />
        ))}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete folder"
        description={`Are you sure you want to delete "${folder.name}"? Documents in this folder will be unassigned.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
