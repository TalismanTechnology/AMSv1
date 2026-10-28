"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCheck,
  FileText,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  FolderTree as FolderTreeIcon,
  Inbox,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TOOLBAR_PILL } from "@/components/admin/toolbar-pill";
import { ViewToggle } from "@/components/admin/view-toggle";
import { ContactAiSortDialog } from "@/components/admin/contact-ai-sort-dialog";
import {
  approveAllSuggestedContacts,
  createContact,
  deleteContact,
  setContactStatus,
  suggestContactsFromDocs,
  updateContact,
  type ContactInput,
} from "@/actions/contacts";
import {
  createContactFolder,
  deleteContactFolder,
  moveContactsToFolder,
  renameContactFolder,
} from "@/actions/contact-folders";
import {
  CONTACT_TOPICS,
  CONTACT_TOPIC_LABELS,
  isContactTopic,
  type SchoolContact,
} from "@/lib/contacts/directory";
import {
  CONTACT_FOLDERS_MISSING_MESSAGE,
  CONTACT_FOLDER_NAME_MAX,
  UNFILED,
  contactFolderCounts,
  contactInitials,
  inFolder,
  matchesContactSearch,
  matchesStatusFilter,
  type ContactFolder,
  type ContactFolderSelection,
  type ContactStatusFilter,
} from "@/lib/contacts/folders";
import { cn } from "@/lib/utils";

export interface ContactView extends SchoolContact {
  source_document_title: string | null;
}

export interface ContactsDirectoryData {
  contacts: ContactView[];
  divisions: { id: string; name: string }[];
  /** The school's contact folders (migration 049), in order. */
  folders: ContactFolder[];
  /** Migration 049 hasn't been applied: one flat grid, no folders. */
  foldersMissing: boolean;
  /** Set when the contacts couldn't be loaded, saying why. */
  loadError: string | null;
  /** Migration 044 hasn't been applied: everything is read-only. */
  tableMissing: boolean;
}

const WHOLE_SCHOOL = "__whole_school";

const AI_SORT_HELP =
  "AI sort: AI proposes folders for your contacts (reusing yours where they fit) and where each one goes. You preview it before anything moves.";

/**
 * The admin Contacts page: a folder list (All contacts, each folder, Unfiled)
 * beside a searchable grid of contact cards, with approve / edit / move /
 * delete on each card and the AI tools in the toolbar.
 */
export function ContactsDirectory({
  schoolId,
  data,
}: {
  schoolId: string;
  data: ContactsDirectoryData;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<
    { contact: ContactView | null; approve: boolean } | null
  >(null);
  const [deleting, setDeleting] = useState<ContactView | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [aiSortOpen, setAiSortOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContactStatusFilter>("all");
  const [selected, setSelected] = useState<ContactFolderSelection>(null);
  const [folderDialog, setFolderDialog] = useState<
    { mode: "create" } | { mode: "rename"; folder: ContactFolder } | null
  >(null);
  const [deletingFolder, setDeletingFolder] = useState<ContactFolder | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);

  const disabled = data.tableMissing;
  const foldersOn = !data.foldersMissing && !data.tableMissing;
  const folders = useMemo(() => (foldersOn ? data.folders : []), [foldersOn, data.folders]);
  const knownFolders = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  const folderName = (id: string | null | undefined) =>
    (id && folders.find((f) => f.id === id)?.name) || null;
  const divisionName = (id: string | null) =>
    data.divisions.find((d) => d.id === id)?.name ?? null;

  // A folder that was deleted (or never loaded) falls back to "All".
  const selection: ContactFolderSelection =
    selected && selected !== UNFILED && !knownFolders.has(selected) ? null : selected;
  const selectedFolder = selection && selection !== UNFILED
    ? folders.find((f) => f.id === selection) ?? null
    : null;

  const suggested = data.contacts.filter((c) => c.status === "suggested");
  const approvedCount = data.contacts.length - suggested.length;

  // Counts follow the search and status filter, so the folder list shows
  // where the matches are.
  const matching = data.contacts.filter(
    (c) =>
      matchesStatusFilter(c, statusFilter) &&
      matchesContactSearch(c, query, [divisionName(c.division_id), folderName(c.folder_id)])
  );
  const counts = contactFolderCounts(matching, folders);
  const visible = matching.filter((c) => inFolder(c, selection, knownFolders));
  const filtering = query.trim() !== "" || statusFilter !== "all";

  async function review(contact: ContactView, status: "approved" | "rejected") {
    setBusyId(contact.id);
    const result = await setContactStatus(schoolId, contact.id, status);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(status === "approved" ? "Contact approved" : "Suggestion rejected");
    router.refresh();
  }

  async function move(contact: ContactView, folderId: string | null) {
    setBusyId(contact.id);
    const result = await moveContactsToFolder(schoolId, [contact.id], folderId);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(folderId ? `Moved to ${folderName(folderId) ?? "folder"}` : "Moved to Unfiled");
    router.refresh();
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const result = await deleteContact(schoolId, deleting.id);
    setDeleteBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Contact deleted");
    setDeleting(null);
    router.refresh();
  }

  async function handleApproveAll() {
    setApprovingAll(true);
    const result = await approveAllSuggestedContacts(
      schoolId,
      suggested.map((c) => c.id)
    );
    setApprovingAll(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setApproveAllOpen(false);
    const n = result.approved ?? 0;
    toast.success(`Approved ${n} contact${n === 1 ? "" : "s"}`);
    router.refresh();
  }

  async function handleSuggest() {
    setSuggesting(true);
    const result = await suggestContactsFromDocs(schoolId);
    setSuggesting(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.inserted
        ? `Found ${result.inserted} new contact${result.inserted === 1 ? "" : "s"} to review.`
        : `No new contacts found in ${result.documentsScanned ?? 0} document${result.documentsScanned === 1 ? "" : "s"} with contact details.`
    );
    router.refresh();
  }

  async function handleDeleteFolder() {
    if (!deletingFolder) return;
    setFolderBusy(true);
    const result = await deleteContactFolder(schoolId, deletingFolder.id);
    setFolderBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Folder deleted");
    if (selection === deletingFolder.id) setSelected(null);
    setDeletingFolder(null);
    router.refresh();
  }

  const heading = selection === null ? "All contacts" : selection === UNFILED ? "Unfiled" : selectedFolder?.name ?? "";

  return (
    <div className="space-y-5">
      {data.loadError && (
        <p className="rounded-lg border border-amber-500/40 bg-card p-4 text-sm text-amber-600">
          {data.loadError}
        </p>
      )}
      {!data.tableMissing && data.foldersMissing && (
        <p className="rounded-lg border border-amber-500/40 bg-card p-4 text-sm text-amber-600">
          {CONTACT_FOLDERS_MISSING_MESSAGE}
        </p>
      )}

      {/* Toolbar: search and status on the left, actions on the right. */}
      <div
        id="setting-suggested-contacts"
        className="flex scroll-mt-6 flex-wrap items-center justify-between gap-3"
      >
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, role, email, topic…"
              aria-label="Search contacts"
              className="h-9 pl-9 pr-8"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <ViewToggle
            label="Show contacts"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: `All ${data.contacts.length}`, icon: <Users /> },
              { value: "approved", label: `Approved ${approvedCount}`, icon: <Check /> },
              { value: "suggested", label: `Suggested ${suggested.length}`, icon: <Sparkles /> },
            ]}
          />
        </div>

        <div id="contacts-ai-toolbar" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={TOOLBAR_PILL}
            onClick={() => setAiSortOpen(true)}
            disabled={!foldersOn || data.contacts.length === 0}
            title={foldersOn ? AI_SORT_HELP : CONTACT_FOLDERS_MISSING_MESSAGE}
          >
            <FolderTreeIcon aria-hidden />
            AI sort
          </button>
          {suggested.length > 0 && (
            <button
              type="button"
              className={TOOLBAR_PILL}
              onClick={() => setApproveAllOpen(true)}
              disabled={disabled || approvingAll || busyId !== null}
            >
              <CheckCheck aria-hidden />
              Approve all {suggested.length}
            </button>
          )}
          <button
            type="button"
            className={TOOLBAR_PILL}
            onClick={handleSuggest}
            disabled={disabled || suggesting}
            title="Find staff contacts in your documents. Parents never see a suggestion until you approve it."
          >
            {suggesting ? <LogoSpinner /> : <Sparkles aria-hidden />}
            {suggesting ? "Reading documents…" : "Suggest from documents"}
          </button>
          <Button
            onClick={() => setEditing({ contact: null, approve: false })}
            disabled={disabled}
            className="h-9 rounded-full bg-primary text-primary-foreground"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add contact
          </Button>
        </div>
      </div>

      <div id="setting-staff-contacts" className="flex scroll-mt-6 flex-col gap-4 md:flex-row">
        {foldersOn && (
          <FolderList
            folders={folders}
            counts={counts}
            selection={selection}
            onSelect={setSelected}
            onCreate={() => setFolderDialog({ mode: "create" })}
          />
        )}

        <section className="min-w-0 flex-1 space-y-3" aria-label={heading}>
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-ink">{heading}</h2>
            <span className="text-sm tabular-nums text-muted-foreground">{visible.length}</span>
            {selectedFolder && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Folder options">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => setFolderDialog({ mode: "rename", folder: selectedFolder })}>
                    <Pencil className="h-4 w-4" />
                    Rename folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeletingFolder(selectedFolder)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {!data.loadError && data.contacts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No contacts yet. Add one, or suggest some from your documents.
            </p>
          ) : visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {filtering
                ? "No contacts match. Try a different search or filter."
                : selection === UNFILED
                  ? "Every contact is in a folder."
                  : "This folder is empty. Move contacts here from a card's menu."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  division={divisionName(contact.division_id)}
                  folder={selection === null ? folderName(contact.folder_id) : null}
                  folders={folders}
                  busy={busyId === contact.id}
                  onApprove={() => review(contact, "approved")}
                  onReject={() => review(contact, "rejected")}
                  onEdit={() =>
                    setEditing({ contact, approve: contact.status === "suggested" })
                  }
                  onDelete={() => setDeleting(contact)}
                  onMove={foldersOn ? (folderId) => move(contact, folderId) : undefined}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={approveAllOpen}
        onOpenChange={(open) => {
          if (!approvingAll) setApproveAllOpen(open);
        }}
        title={`Approve ${suggested.length} suggested contact${suggested.length === 1 ? "" : "s"}?`}
        description="They'll be added to your staff contacts: parents can find them on their Contacts page and the assistant can show them. You can still edit or delete any of them afterwards."
        confirmLabel={`Approve ${suggested.length}`}
        variant="default"
        loading={approvingAll}
        onConfirm={handleApproveAll}
      />

      {editing && (
        <ContactDialog
          schoolId={schoolId}
          contact={editing.contact}
          approve={editing.approve}
          divisions={data.divisions}
          folderId={selectedFolder?.id ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this contact?"
        description={`${deleting?.name || deleting?.role || "This contact"} will no longer be shown to parents.`}
        confirmLabel="Delete contact"
        loading={deleteBusy}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={!!deletingFolder}
        onOpenChange={(open) => !open && !folderBusy && setDeletingFolder(null)}
        title={`Delete the folder "${deletingFolder?.name ?? ""}"?`}
        description="Only the folder is deleted. Its contacts move to Unfiled (parents see them under Other)."
        confirmLabel="Delete folder"
        loading={folderBusy}
        onConfirm={handleDeleteFolder}
      />

      {folderDialog && (
        <FolderNameDialog
          schoolId={schoolId}
          folder={folderDialog.mode === "rename" ? folderDialog.folder : null}
          onClose={() => setFolderDialog(null)}
          onSaved={(id) => {
            setFolderDialog(null);
            if (id) setSelected(id);
            router.refresh();
          }}
        />
      )}

      {foldersOn && (
        <ContactAiSortDialog
          open={aiSortOpen}
          onOpenChange={setAiSortOpen}
          schoolId={schoolId}
          folders={folders}
        />
      )}
    </div>
  );
}

const FOLDER_ITEM =
  "flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm transition-colors md:w-full";

function FolderButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        FOLDER_ITEM,
        "border md:border-0 [&_svg]:size-4 [&_svg]:shrink-0",
        active
          ? "border-transparent bg-muted font-medium text-ink"
          : "border-border text-muted-foreground hover:bg-muted/50 hover:text-ink"
      )}
    >
      {icon}
      <span className="max-w-[12rem] truncate md:max-w-none">{label}</span>
      <span className="ml-auto pl-1 text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

/**
 * The folder list: a sidebar from md up, a row of scrollable chips on phones.
 */
function FolderList({
  folders,
  counts,
  selection,
  onSelect,
  onCreate,
}: {
  folders: ContactFolder[];
  counts: ReturnType<typeof contactFolderCounts>;
  selection: ContactFolderSelection;
  onSelect: (selection: ContactFolderSelection) => void;
  onCreate: () => void;
}) {
  return (
    <nav
      aria-label="Contact folders"
      className="md:w-56 md:shrink-0 md:self-start md:rounded-xl md:border md:border-border md:p-3"
    >
      <div className="mb-2 hidden items-center justify-between border-b border-border pb-2.5 md:flex">
        <span className="text-xs text-muted-foreground">Folders</span>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCreate} aria-label="New folder">
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0">
        <FolderButton
          active={selection === null}
          icon={<Users />}
          label="All contacts"
          count={counts.total}
          onClick={() => onSelect(null)}
        />
        {folders.map((f) => (
          <FolderButton
            key={f.id}
            active={selection === f.id}
            icon={<FolderIcon />}
            label={f.name}
            count={counts.byFolder.get(f.id) ?? 0}
            onClick={() => onSelect(f.id)}
          />
        ))}
        <FolderButton
          active={selection === UNFILED}
          icon={<Inbox />}
          label="Unfiled"
          count={counts.unfiled}
          onClick={() => onSelect(UNFILED)}
        />
        <button
          type="button"
          onClick={onCreate}
          className={cn(FOLDER_ITEM, "border border-dashed border-border text-muted-foreground hover:text-ink md:hidden")}
        >
          <FolderPlus className="h-4 w-4" />
          New folder
        </button>
      </div>
    </nav>
  );
}

function FolderNameDialog({
  schoolId,
  folder,
  onClose,
  onSaved,
}: {
  schoolId: string;
  /** Renaming this folder; null = creating one. */
  folder: ContactFolder | null;
  onClose: () => void;
  onSaved: (createdId: string | null) => void;
}) {
  const [name, setName] = useState(folder?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const result = folder
      ? await renameContactFolder(schoolId, folder.id, name)
      : await createContactFolder(schoolId, name);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(folder ? "Folder renamed" : "Folder created");
    onSaved((result as { id?: string }).id ?? null);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
            {folder ? "Rename folder" : "New folder"}
          </DialogTitle>
          <DialogDescription>
            Parents see contacts grouped under this name.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Admissions"
            maxLength={CONTACT_FOLDER_NAME_MAX}
            aria-label="Folder name"
            autoFocus
          />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving && <LogoSpinner className="mr-2" />}
              {folder ? "Save" : "Create folder"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactCard({
  contact,
  division,
  folder,
  folders,
  busy,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onMove,
}: {
  contact: ContactView;
  division: string | null;
  /** The contact's folder, shown when viewing all contacts. */
  folder: string | null;
  folders: ContactFolder[];
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Absent while folders aren't available. */
  onMove?: (folderId: string | null) => void;
}) {
  const topics = contact.topics.filter(isContactTopic);
  const isSuggested = contact.status === "suggested";
  const title = contact.name || contact.role;

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-card p-4",
        isSuggested ? "border-amber-500/40" : "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-ink-soft"
        >
          {contactInitials(contact)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink" title={title}>
            {title}
          </p>
          {contact.name && contact.role && (
            <p className="truncate text-xs text-ink-soft" title={contact.role}>
              {contact.role}
            </p>
          )}
          {isSuggested && (
            <span
              className="mt-1 inline-block whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
              title="Parents don't see this contact until you approve it."
            >
              Suggested · not shown yet
            </span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="-mr-1 -mt-1 h-8 w-8 shrink-0 p-0"
              aria-label={`Options for ${title}`}
              disabled={busy}
            >
              {busy ? <LogoSpinner /> : <MoreHorizontal className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="h-4 w-4" />
              {isSuggested ? "Review & edit" : "Edit"}
            </DropdownMenuItem>
            {onMove && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="h-4 w-4" />
                  Move to folder
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  {folders.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      disabled={contact.folder_id === f.id}
                      onSelect={() => onMove(f.id)}
                    >
                      <FolderIcon className="h-4 w-4" />
                      <span className="truncate">{f.name}</span>
                    </DropdownMenuItem>
                  ))}
                  {folders.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    disabled={!contact.folder_id}
                    onSelect={() => onMove(null)}
                  >
                    <Inbox className="h-4 w-4" />
                    Unfiled
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 space-y-1 text-xs text-ink-soft">
        {contact.email && (
          <p className="flex min-w-0 items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{contact.email}</span>
          </p>
        )}
        {contact.phone && (
          <p className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {contact.phone}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {folder && (
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-ink-soft">
            <FolderIcon className="h-3 w-3" />
            {folder}
          </span>
        )}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-ink-soft">
          {division ?? "Whole school"}
        </span>
        {topics.map((t) => (
          <span
            key={t}
            className="rounded-full border border-border px-2 py-0.5 text-xs text-ink-soft"
          >
            {CONTACT_TOPIC_LABELS[t]}
          </span>
        ))}
        {topics.length === 0 && (
          <span
            className="rounded-full border border-dashed border-amber-500/60 px-2 py-0.5 text-xs text-amber-600"
            title="Without topics the assistant never routes questions to this contact."
          >
            No topics
          </span>
        )}
      </div>

      {isSuggested && (contact.source_document_title || contact.source_excerpt) && (
        <details className="group mt-3 border-t border-border pt-3 text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Found in {contact.source_document_title ?? "a document"}
            </span>
          </summary>
          {contact.source_excerpt && (
            <p className="mt-2 whitespace-pre-wrap break-words rounded bg-muted/50 px-3 py-2 text-ink-soft">
              {contact.source_excerpt}
            </p>
          )}
        </details>
      )}

      {isSuggested && (
        <div className="mt-auto flex gap-2 pt-4">
          <Button
            size="sm"
            disabled={busy}
            onClick={onApprove}
            className="flex-1 bg-primary text-primary-foreground"
          >
            <Check className="mr-1.5 h-4 w-4" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            className="flex-1 text-red-500 hover:text-red-600"
            onClick={onReject}
          >
            <X className="mr-1.5 h-4 w-4" />
            Reject
          </Button>
        </div>
      )}
    </article>
  );
}

function ContactDialog({
  schoolId,
  contact,
  approve,
  divisions,
  folderId,
  onClose,
  onSaved,
}: {
  schoolId: string;
  contact: ContactView | null;
  /** Saving also approves (editing a suggestion). */
  approve: boolean;
  divisions: { id: string; name: string }[];
  /** A new contact goes into this folder. */
  folderId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(contact?.name ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [divisionId, setDivisionId] = useState(contact?.division_id ?? WHOLE_SCHOOL);
  const [topics, setTopics] = useState<string[]>(contact?.topics.filter(isContactTopic) ?? []);
  const [saving, setSaving] = useState(false);

  function toggleTopic(topic: string) {
    setTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  }

  async function handleSubmit() {
    setSaving(true);
    const input: ContactInput = {
      name,
      role,
      email,
      phone,
      divisionId: divisionId === WHOLE_SCHOOL ? null : divisionId,
      topics,
    };
    const result = contact
      ? await updateContact(schoolId, contact.id, input, { approve })
      : await createContact(schoolId, input);
    const createdId = (result as { id?: string }).id;
    if (!result.error && !contact && folderId && createdId) {
      const moved = await moveContactsToFolder(schoolId, [createdId], folderId);
      if (moved.error) toast.error(moved.error);
    }
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(approve ? "Contact approved" : contact ? "Contact updated" : "Contact added");
    onSaved();
  }

  const canSave = (name.trim() || role.trim()) && (email.trim() || phone.trim());

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
            {approve ? "Review suggestion" : contact ? "Edit contact" : "Add contact"}
          </DialogTitle>
          <DialogDescription>
            Parents see the name, role, email and phone exactly as entered here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-name" className="text-ink-soft">Name</Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-role" className="text-ink-soft">Role</Label>
              <Input
                id="contact-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="School Nurse"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email" className="text-ink-soft">Email</Label>
              <Input
                id="contact-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nurse@yourschool.org"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone" className="text-ink-soft">Phone</Label>
              <Input
                id="contact-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-ink-soft">Division</Label>
            <Select value={divisionId} onValueChange={setDivisionId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_SCHOOL}>Whole school</SelectItem>
                {divisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-ink-soft">Topics</Label>
            <div className="flex flex-wrap gap-2">
              {CONTACT_TOPICS.map((t) => {
                const on = topics.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTopic(t)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-ink-soft hover:bg-secondary"
                    )}
                  >
                    {CONTACT_TOPIC_LABELS[t]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Questions on these topics are routed to this contact.
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSave || saving}
              className="bg-primary text-primary-foreground"
            >
              {saving && <LogoSpinner className="mr-2" />}
              {approve ? "Save & approve" : contact ? "Save" : "Add contact"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
