"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, FileText, Mail, Pencil, Phone, Plus, Sparkles, Trash2, X } from "lucide-react";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TOOLBAR_PILL } from "@/components/admin/toolbar-pill";
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
  CONTACT_TOPICS,
  CONTACT_TOPIC_LABELS,
  isContactTopic,
  type SchoolContact,
} from "@/lib/contacts/directory";
import { cn } from "@/lib/utils";

export interface ContactView extends SchoolContact {
  source_document_title: string | null;
}

export interface ContactsDirectoryData {
  contacts: ContactView[];
  divisions: { id: string; name: string }[];
  /** Set when the contacts couldn't be loaded, saying why. */
  loadError: string | null;
  /** Migration 044 hasn't been applied: everything is read-only. */
  tableMissing: boolean;
}

const WHOLE_SCHOOL = "__whole_school";

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

  const approved = data.contacts.filter((c) => c.status === "approved");
  const suggested = data.contacts.filter((c) => c.status === "suggested");
  const divisionName = (id: string | null) =>
    data.divisions.find((d) => d.id === id)?.name ?? null;
  const disabled = data.tableMissing;

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

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">Staff contacts</h2>
            <p className="text-sm text-muted-foreground">
              When the assistant can&apos;t answer a question, it shows parents
              the right person to contact from this list, matched by topic and
              division. Contacts tagged &quot;Main office&quot; catch everything
              else. With no contacts, parents are pointed to the school office.
            </p>
          </div>
          <Button
            onClick={() => setEditing({ contact: null, approve: false })}
            disabled={disabled}
            className="bg-primary text-primary-foreground"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add contact
          </Button>
        </div>

        {data.loadError && (
          <p className="rounded-lg border border-amber-500/40 bg-card p-4 text-sm text-amber-600">
            {data.loadError}
          </p>
        )}

        {!data.loadError && approved.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No contacts yet. Add one, or suggest some from your documents below.
          </p>
        )}

        <div className="space-y-3">
          {approved.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              division={divisionName(contact.division_id)}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing({ contact, approve: false })}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-600"
                onClick={() => setDeleting(contact)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </ContactRow>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">Suggested</h2>
            <p className="text-sm text-muted-foreground">
              Contacts found in your documents. Parents never see a suggestion
              until you approve it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {suggested.length > 0 && (
              <button
                type="button"
                className={TOOLBAR_PILL}
                onClick={() => setApproveAllOpen(true)}
                disabled={disabled || approvingAll || busyId !== null}
              >
                <CheckCheck aria-hidden />
                Approve all
              </button>
            )}
            <button
              type="button"
              className={TOOLBAR_PILL}
              onClick={handleSuggest}
              disabled={disabled || suggesting}
            >
              {suggesting ? <LogoSpinner /> : <Sparkles aria-hidden />}
              {suggesting ? "Reading documents…" : "Suggest contacts from documents"}
            </button>
          </div>
        </div>

        {suggested.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing to review.
          </p>
        ) : (
          <div className="space-y-3">
            {suggested.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                division={divisionName(contact.division_id)}
                showSource
              >
                <Button
                  size="sm"
                  disabled={busyId === contact.id}
                  onClick={() => review(contact, "approved")}
                  className="bg-primary text-primary-foreground"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === contact.id}
                  onClick={() => setEditing({ contact, approve: true })}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === contact.id}
                  className="text-red-500 hover:text-red-600"
                  onClick={() => review(contact, "rejected")}
                >
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </ContactRow>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={approveAllOpen}
        onOpenChange={(open) => {
          if (!approvingAll) setApproveAllOpen(open);
        }}
        title={`Approve ${suggested.length} suggested contact${suggested.length === 1 ? "" : "s"}?`}
        description="They'll be added to your staff contacts, and the assistant can show them to parents. You can still edit or delete any of them afterwards."
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
    </div>
  );
}

function ContactRow({
  contact,
  division,
  showSource = false,
  children,
}: {
  contact: ContactView;
  division: string | null;
  showSource?: boolean;
  children: React.ReactNode;
}) {
  const topics = contact.topics.filter(isContactTopic);
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-ink">
          {contact.name || contact.role}
          {contact.name && contact.role && (
            <span className="font-normal text-ink-soft"> · {contact.role}</span>
          )}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
          {contact.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              {contact.email}
            </span>
          )}
          {contact.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              {contact.phone}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
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
            <span className="rounded-full border border-dashed border-amber-500/60 px-2 py-0.5 text-xs text-amber-600">
              No topics — never shown
            </span>
          )}
        </div>
      </div>

      {showSource && (contact.source_document_title || contact.source_excerpt) && (
        <div className="mt-4 space-y-1 border-t border-border pt-4 text-xs">
          {contact.source_document_title && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              Found in {contact.source_document_title}
            </p>
          )}
          {contact.source_excerpt && (
            <p className="whitespace-pre-wrap break-words rounded bg-muted/50 px-3 py-2 text-ink-soft">
              {contact.source_excerpt}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ContactDialog({
  schoolId,
  contact,
  approve,
  divisions,
  onClose,
  onSaved,
}: {
  schoolId: string;
  contact: ContactView | null;
  /** Saving also approves (editing a suggestion). */
  approve: boolean;
  divisions: { id: string; name: string }[];
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
