"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSchool } from "@/components/shared/school-context";
import {
  buildAdminSearchIndex,
  searchAdmin,
  type AdminSearchEntry,
  type SearchGroup,
} from "@/lib/admin/search";
import { cn } from "@/lib/utils";
import { highlightAnchor } from "./highlight-anchor";

// The admin command palette: ⌘K / Ctrl+K (or the sidebar's search box) to
// jump to any admin page or individual setting. Choosing a setting navigates
// to its page, then scrolls to it and highlights it.

const CommandPaletteContext = createContext<{ open: () => void } | null>(null);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** "⌘K" on Apple devices, "Ctrl K" elsewhere (and during server render). */
export function useShortcutLabel() {
  const mac = useSyncExternalStore(
    () => () => {},
    isMac,
    () => false
  );
  return mac ? "⌘K" : "Ctrl K";
}

const GROUP_ICONS: Record<SearchGroup, typeof FileText> = {
  Pages: FileText,
  Settings: SlidersHorizontal,
  Features: Sparkles,
};

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Deep links (and palette jumps to another page) arrive with a #hash: once
  // the page renders, bring that setting into view and highlight it.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) highlightAnchor(id);
  }, [pathname]);

  const value = useMemo(() => ({ open: openPalette }), [openPalette]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Search admin</DialogTitle>
          <DialogDescription className="sr-only">
            Find an admin page or setting and jump to it.
          </DialogDescription>
          {/* Remounted on each open, so the query starts empty. */}
          {open && <PaletteBody onClose={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </CommandPaletteContext.Provider>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { slug, role, isSuperAdmin } = useSchool();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // The admin layout already keeps non-admins out; checked again here so the
  // index is never built for someone who can't use it.
  const index = useMemo(
    () =>
      role === "admin" || isSuperAdmin
        ? buildAdminSearchIndex(slug, { isSuperAdmin })
        : [],
    [slug, role, isSuperAdmin]
  );
  // Best match first; the rest of its group follows it, then the next group,
  // so each group heading appears once.
  const results = useMemo(() => {
    const ranked = searchAdmin(index, query);
    const order = [...new Set(ranked.map((e) => e.group))];
    return order.flatMap((group) => ranked.filter((e) => e.group === group));
  }, [index, query]);
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function choose(entry: AdminSearchEntry) {
    onClose();
    const here = window.location.pathname + window.location.search;
    const [target] = entry.href.split("#");
    if (target !== here) router.push(entry.href);
    else if (entry.anchor) window.history.replaceState(null, "", entry.href);
    if (entry.anchor) highlightAnchor(entry.anchor);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = results[activeIndex];
      if (entry) choose(entry);
    }
  }

  return (
    <div className="flex max-h-[min(70vh,32rem)] flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search pages and settings…"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          aria-label="Search pages and settings"
          className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[0.7rem] text-muted-foreground sm:inline">
          Esc
        </kbd>
      </div>

      {results.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul ref={listRef} id={listId} role="listbox" className="overflow-y-auto p-2">
          {results.map((entry, i) => {
            const heading = entry.group !== results[i - 1]?.group ? entry.group : null;
            const Icon = GROUP_ICONS[entry.group];
            const selected = i === activeIndex;
            return (
              <li key={entry.id} role="presentation">
                {heading && (
                  <p
                    role="presentation"
                    className="px-2.5 pb-1 pt-2 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {heading}
                  </p>
                )}
                <div
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(entry)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                    selected ? "bg-secondary text-ink" : "text-ink-soft"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.label}</span>
                  {entry.context && (
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.context}
                    </span>
                  )}
                  {selected && (
                    <CornerDownLeft className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
