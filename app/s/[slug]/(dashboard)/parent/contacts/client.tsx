"use client";

import { useMemo, useState } from "react";
import { Folder as FolderIcon, Mail, Phone, Search, Users, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CONTACT_TOPIC_LABELS,
  isContactTopic,
  mailtoHref,
  telHref,
} from "@/lib/contacts/directory";
import {
  contactInitials,
  groupContactsByFolder,
  matchesContactSearch,
  type ContactFolder,
} from "@/lib/contacts/folders";
import type { ParentContact } from "@/lib/contacts/parent-directory";
import { cn } from "@/lib/utils";

const ALL = "__all";

export function ParentContactsClient({
  contacts,
  folders,
  divisions,
}: {
  contacts: ParentContact[];
  folders: ContactFolder[];
  divisions: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>(ALL);

  const divisionName = (id: string | null) =>
    (id && divisions.find((d) => d.id === id)?.name) || null;

  const groups = useMemo(() => groupContactsByFolder(contacts, folders), [contacts, folders]);
  // One group and no folders: no headings or chips, just the grid.
  const grouped = !(groups.length === 1 && groups[0].id === null && folders.length === 0);

  const shown = groups
    .filter((g) => folderFilter === ALL || (g.id ?? "") === folderFilter)
    .map((g) => ({
      ...g,
      contacts: g.contacts.filter((c) =>
        matchesContactSearch(c, query, [g.id ? g.name : null, divisionName(c.division_id)])
      ),
    }))
    .filter((g) => g.contacts.length > 0);
  const matchCount = shown.reduce((n, g) => n + g.contacts.length, 0);
  const hasFilters = query.trim() !== "" || folderFilter !== ALL;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-6 md:px-8 md:pb-16 md:pt-12">
      <header className="mb-6 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Contacts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find the right person or office at school.
        </p>
      </header>

      {contacts.length > 0 && (
        <div className="mb-6 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, role, department or topic..."
              aria-label="Search contacts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 pl-9 pr-10 sm:h-9"
            />
            {query && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Clear search"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0 sm:h-7 sm:w-7"
                onClick={() => setQuery("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {grouped && groups.length > 1 && (
            <div
              role="group"
              aria-label="Departments"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
            >
              {[{ id: ALL, name: "All", count: contacts.length }, ...groups.map((g) => ({
                id: g.id ?? "",
                name: g.name,
                count: g.contacts.length,
              }))].map((chip) => {
                const active = folderFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFolderFilter(chip.id)}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-ink-soft hover:bg-secondary"
                    )}
                  >
                    {chip.name}
                    <span className={cn("text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {hasFilters && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {matchCount} contact{matchCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}

      {matchCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="mb-3 h-6 w-6 text-muted-foreground" />
          <h3 className="text-base font-semibold text-ink">No contacts found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters
              ? "Try a different search."
              : "Your school hasn't added its staff directory yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {shown.map((group) => (
            <section key={group.id ?? "_other"} aria-label={grouped ? group.name : "Contacts"}>
              {grouped && (
                <h2 className="mb-3 flex items-center gap-2 text-sm font-medium tracking-[-0.01em] text-ink">
                  <FolderIcon className="h-[18px] w-[18px] text-muted-foreground" />
                  {group.name}
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {group.contacts.length}
                  </Badge>
                </h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.contacts.map((c) => (
                  <ContactCard key={c.id} contact={c} division={divisionName(c.division_id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactCard({ contact, division }: { contact: ParentContact; division: string | null }) {
  const mail = contact.email ? mailtoHref(contact.email) : null;
  const tel = contact.phone ? telHref(contact.phone) : null;
  const topics = contact.topics.filter(isContactTopic);
  const title = contact.name || contact.role;

  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-ink-soft"
        >
          {contactInitials(contact)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium tracking-[-0.01em] text-ink" title={title}>
            {title}
          </h3>
          {contact.name && contact.role && (
            <p className="text-xs text-ink-soft">{contact.role}</p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {division && (
              <Badge variant="secondary" className="text-[10px]">
                {division}
              </Badge>
            )}
            {topics.slice(0, 3).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] font-normal text-ink-soft">
                {CONTACT_TOPIC_LABELS[t]}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto space-y-1.5 pt-3">
        {contact.email && (
          <a
            href={mail ?? undefined}
            className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-ink-soft transition-colors hover:bg-secondary hover:text-ink sm:min-h-8"
          >
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.phone && (
          <a
            href={tel ?? undefined}
            className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-ink-soft transition-colors hover:bg-secondary hover:text-ink sm:min-h-8"
          >
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
            {contact.phone}
          </a>
        )}
      </div>
    </article>
  );
}
