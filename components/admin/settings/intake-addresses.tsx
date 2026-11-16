"use client";

import { useState } from "react";
import { Check, Copy, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogoSpinner } from "@/components/logo-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GradeVisibilityPicker } from "@/components/admin/grade-visibility-picker";
import {
  createIntakeAddress,
  deleteIntakeAddress,
  setIntakeAddressEnabled,
  updateIntakeAddress,
} from "@/actions/intake-addresses";
import { formatVisibleGrades } from "@/lib/documents/grade-visibility";
import { calendarColorClasses } from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import type { IntakeAddress } from "@/lib/email/addresses";
import type { EventCalendar, Folder } from "@/lib/types";

// The school's intake addresses (migration 051): the whole-school and
// division addresses, plus one per mailing list an admin adds. Each can be
// renamed, limited to parents of some grades, limited to some senders, given
// a default folder and switched off. Only list addresses can be deleted.

export function IntakeAddressList({
  schoolId,
  addresses: initial,
  divisions,
  folders,
  inboundDomain,
}: {
  schoolId: string;
  addresses: IntakeAddress[];
  divisions: EventCalendar[];
  folders: Folder[];
  inboundDomain: string;
}) {
  const [addresses, setAddresses] = useState(initial);
  const [editing, setEditing] = useState<IntakeAddress | "new" | null>(null);
  const [deleting, setDeleting] = useState<IntakeAddress | null>(null);
  const [busy, setBusy] = useState(false);

  const divisionOf = (a: IntakeAddress) => divisions.find((d) => d.id === a.divisionId);
  const nameOf = (a: IntakeAddress) =>
    a.label?.trim() ||
    (a.kind === "school" ? "Whole school" : a.kind === "division" ? divisionOf(a)?.name ?? "Division" : a.token);

  function replace(address: IntakeAddress) {
    setAddresses((prev) =>
      prev.some((a) => a.id === address.id)
        ? prev.map((a) => (a.id === address.id ? address : a))
        : [...prev, address]
    );
  }

  async function toggle(address: IntakeAddress) {
    const result = await setIntakeAddressEnabled(schoolId, address.id, !address.enabled);
    if ("error" in result) return toast.error(result.error);
    replace(result.address);
    toast.success(result.address.enabled ? "Address switched on" : "Address switched off");
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const result = await deleteIntakeAddress(schoolId, deleting.id);
    setBusy(false);
    if ("error" in result) return toast.error(result.error);
    setAddresses((prev) => prev.filter((a) => a.id !== deleting.id));
    setDeleting(null);
    toast.success("Address deleted");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label>Where to send emails</Label>
          <p className="text-xs text-muted-foreground">
            Forward school emails, or subscribe an address to a mailing list.
            Add one per list to control which parents see what it receives.
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setEditing("new")}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add address
        </Button>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {addresses.map((address) => {
          const division = divisionOf(address);
          return (
            <li key={address.id} className={cn("space-y-2.5 p-3.5 sm:p-4", !address.enabled && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {division && (
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", calendarColorClasses(division.color).dot)} />
                    )}
                    <span className="truncate">{nameOf(address)}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="font-normal text-ink-soft">
                      {formatVisibleGrades(address.visibleGrades)}
                    </Badge>
                    {address.allowedSenders && (
                      <Badge variant="outline" className="font-normal text-ink-soft">
                        {address.allowedSenders.length === 1
                          ? `Only ${address.allowedSenders[0]}`
                          : `${address.allowedSenders.length} allowed senders`}
                      </Badge>
                    )}
                    {address.defaultFolderId && (
                      <Badge variant="outline" className="font-normal text-ink-soft">
                        Folder: {folders.find((f) => f.id === address.defaultFolderId)?.name ?? "—"}
                      </Badge>
                    )}
                    {!address.enabled && <Badge className="bg-secondary text-secondary-foreground">Off</Badge>}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Options for ${nameOf(address)}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(address)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => toggle(address)}>
                      {address.enabled ? "Switch off" : "Switch on"}
                    </DropdownMenuItem>
                    {address.kind === "list" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(address)}>
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CopyableAddress label={nameOf(address)} address={`${address.token}@${inboundDomain}`} />
            </li>
          );
        })}
      </ul>

      {editing && (
        <AddressDialog
          schoolId={schoolId}
          address={editing === "new" ? null : editing}
          title={editing === "new" ? "Add an address" : `Edit ${nameOf(editing)}`}
          folders={folders}
          onClose={() => setEditing(null)}
          onSaved={(address) => {
            replace(address);
            setEditing(null);
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting ? nameOf(deleting) : "address"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Mail sent to this address will be turned away. Documents it
              already added stay in your library, with the same visibility.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy && <LogoSpinner className="mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddressDialog({
  schoolId,
  address,
  title,
  folders,
  onClose,
  onSaved,
}: {
  schoolId: string;
  address: IntakeAddress | null;
  title: string;
  folders: Folder[];
  onClose: () => void;
  onSaved: (address: IntakeAddress) => void;
}) {
  const labelRequired = !address || address.kind === "list";
  const [label, setLabel] = useState(address?.label ?? "");
  const [grades, setGrades] = useState<string[] | null>(address?.visibleGrades ?? null);
  const [senders, setSenders] = useState((address?.allowedSenders ?? []).join("\n"));
  const [folderId, setFolderId] = useState(address?.defaultFolderId ?? "none");
  const [saving, setSaving] = useState(false);

  const invalid = (labelRequired && !label.trim()) || (grades !== null && grades.length === 0);

  async function save() {
    setSaving(true);
    const input = {
      label,
      visibleGrades: grades,
      allowedSenders: senders,
      defaultFolderId: folderId === "none" ? null : folderId,
    };
    const result = address
      ? await updateIntakeAddress(schoolId, address.id, input)
      : await createIntakeAddress(schoolId, input);
    setSaving(false);
    if ("error" in result) return toast.error(result.error);
    toast.success(address ? "Address saved" : "Address added");
    onSaved(result.address);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">{title}</DialogTitle>
          <DialogDescription>
            {address
              ? "Changes apply to emails that arrive from now on. Documents already added keep their visibility."
              : "You'll get a new private address to subscribe to the mailing list."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="intake-label" className="text-ink-soft">
              Name{labelRequired ? "" : " (optional)"}
            </Label>
            <Input
              id="intake-label"
              value={label}
              maxLength={80}
              placeholder="e.g. Middle School parents"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-ink-soft">Who can see documents from this address</Label>
            <GradeVisibilityPicker idPrefix="intake-visibility" value={grades} onChange={setGrades} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="intake-senders" className="text-ink-soft">
              Allowed senders (optional)
            </Label>
            <Textarea
              id="intake-senders"
              rows={2}
              value={senders}
              placeholder="office@school.org, school.org"
              onChange={(e) => setSenders(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Email addresses or domains, one per line. Leave empty to accept
              mail from anyone.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-ink-soft">Default folder (optional)</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger>
                <SelectValue placeholder="Let auto-sort decide" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Let auto-sort decide</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={invalid || saving}>
              {saving && <LogoSpinner className="mr-2" />}
              {address ? "Save changes" : "Add address"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CopyableAddress({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={address}
        aria-label={`${label} inbound address`}
        className="h-9 px-2.5 font-mono text-[11px] sm:px-3 sm:text-sm"
        onFocus={(e) => e.target.select()}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={copy}
        className="h-9 w-9 shrink-0"
        aria-label={`Copy ${label} address`}
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
