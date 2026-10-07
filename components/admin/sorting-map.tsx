"use client";

import "@xyflow/react/dist/style.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Dimensions,
  type FitViewOptions,
  type NodeChange,
} from "@xyflow/react";
import {
  ChevronsDownUp,
  FileText,
  Folder as FolderIcon,
  GraduationCap,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ViewToggle } from "@/components/admin/view-toggle";
import { updateDocument } from "@/actions/documents";
import { cn } from "@/lib/utils";
import { calendarHex } from "@/lib/event-calendars";
import {
  buildTree,
  groupByDivision,
  groupByFolder,
  hubId,
  layoutTree,
  matchesQuery,
  nodesWithMatches,
  normalizeQuery,
  openForMatches,
  parentsOf,
  type MapDivision,
  type MapView,
  type TreeNode,
} from "@/lib/documents/sorting-map";
import {
  SOURCE_HANDLE_ID,
  SortingMapContext,
  TARGET_HANDLE_ID,
  edgeTypes,
  nodeTypes,
  type LinkEdge,
  type MapNode,
  type SortingMapContextValue,
} from "./sorting-map-nodes";
import type { Category, Document, EventCalendar, Folder } from "@/lib/types";

const FIT_VIEW: FitViewOptions = { padding: 0.12, maxZoom: 1 };
const MAP_HEIGHT = "h-[calc(100dvh-16rem)] min-h-[460px]";
/**
 * React Flow labels every node wrapper an interactive "node". Ours aren't:
 * the card inside is the named group, and its rows are what take focus.
 */
const PLAIN_WRAPPER = { "aria-roledescription": undefined };
/**
 * React Flow turns pointer events off on nodes that can't be dragged or
 * selected, which on a touch screen (no dragging) would make every row dead.
 */
const NODE_STYLE = { pointerEvents: "all" } as const;

/** A document re-sorted on the map: one of its two sorting fields, changed. */
interface Move {
  docId: string;
  field: "category_id" | "folder_id";
  value: string | null;
}

/** How long to animate, or not at all when the user asked for less motion. */
function motionMs(ms: number): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
}

const COARSE_POINTER = "(pointer: coarse)";

function subscribeToPointer(onChange: () => void) {
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the main pointer is a finger, which can't hover or drag rows. */
function useTouchScreen(): boolean {
  return useSyncExternalStore(
    subscribeToPointer,
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false
  );
}

interface SortingMapProps {
  documents: Document[];
  categories: Category[];
  folders: Folder[];
  divisions: EventCalendar[];
  schoolId: string;
  autoSortEnabled: boolean;
  /** Where the auto-sort switch lives. */
  settingsHref: string;
  onOpenDocument: (doc: Document) => void;
  onEditDocument: (doc: Document) => void;
  /** Leave the map for the list, filtered to this category or folder. */
  onShowInList: (view: MapView, targetId: string) => void;
  /** Documents being sorted by AI right now. */
  sortingIds: ReadonlySet<string>;
  onSortDocuments: (docIds: string[]) => void;
}

/**
 * A tree of the library: the hub branches into the whole school and each
 * division (or the top-level folders), and those into their categories (or
 * subfolders), each document listed inside the card it was sorted into.
 * Dragging a document onto another card re-sorts it.
 */
export function SortingMap({
  documents,
  categories,
  folders,
  divisions,
  schoolId,
  autoSortEnabled,
  settingsHref,
  onOpenDocument,
  onEditDocument,
  onShowInList,
  sortingIds,
  onSortDocuments,
}: SortingMapProps) {
  const router = useRouter();
  const [view, setView] = useState<MapView>("category");
  const [search, setSearch] = useState("");
  // Bumped to ask the canvas to bring the search matches into view.
  const [fitRequest, setFitRequest] = useState(0);
  const [docs, applyMove] = useOptimistic(
    documents,
    (current: Document[], move: Move) =>
      current.map((doc) =>
        doc.id === move.docId ? { ...doc, [move.field]: move.value } : doc
      )
  );

  const query = normalizeQuery(search);
  const matchCount = useMemo(
    () => (query ? docs.filter((doc) => matchesQuery(doc, query)).length : 0),
    [docs, query]
  );

  // Keep "processing" rows current, as the list does while it is showing.
  const processing = documents.some((doc) => doc.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [processing, router]);

  const saveMove = useCallback(
    (move: Move, onSaved?: () => void) => {
      startTransition(async () => {
        applyMove(move);
        try {
          // updateDocument also records the change in the audit log.
          const result = await updateDocument(
            move.docId,
            schoolId,
            move.field === "category_id"
              ? { category_id: move.value }
              : { folder_id: move.value }
          );
          if (result.error) {
            toast.error(`Couldn't move the document: ${result.error}`);
            return;
          }
          onSaved?.();
        } catch {
          toast.error(
            "Couldn't move the document. Check your connection and try again."
          );
        }
      });
    },
    [applyMove, schoolId]
  );

  const moveDocument = useCallback(
    (doc: Document, to: TreeNode<Document>) => {
      const field = view === "category" ? "category_id" : "folder_id";
      const previous = doc[field];
      if (previous === to.targetId) return;

      saveMove({ docId: doc.id, field, value: to.targetId }, () => {
        const where = to.group ? `${to.group} · ${to.name}` : to.name;
        const message = to.targetId
          ? `Moved “${doc.title}” to ${where}`
          : field === "category_id"
            ? `“${doc.title}” no longer has a category`
            : `“${doc.title}” is no longer in a folder`;
        toast.success(message, {
          action: {
            label: "Undo",
            onClick: () =>
              saveMove({ docId: doc.id, field, value: previous }),
          },
        });
      });
    },
    [view, saveMove]
  );

  if (documents.length === 0) {
    return (
      <div
        className={cn(
          MAP_HEIGHT,
          "flex flex-col items-center justify-center rounded-xl border border-border text-center"
        )}
      >
        <FileText className="mb-4 h-6 w-6 text-muted-foreground" />
        <h3 className="text-xl font-semibold tracking-[-0.01em] text-ink">
          Nothing to map yet
        </h3>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
          Upload documents and they&apos;ll appear here, grouped by category
          and folder.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ViewToggle
          label="Group documents by"
          value={view}
          onChange={setView}
          options={[
            { value: "category", label: "By division", icon: <GraduationCap /> },
            { value: "folder", label: "By folder", icon: <FolderIcon /> },
          ]}
        />

        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setFitRequest((n) => n + 1);
              if (event.key === "Escape") setSearch("");
            }}
            placeholder="Find a document…"
            aria-label="Find a document on the map"
            className="pl-9"
          />
        </div>

        {/* Always rendered, so screen readers announce the count as it changes. */}
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {query &&
            (matchCount === 0 ? (
              "No matches"
            ) : (
              <>
                {matchCount} match{matchCount === 1 ? "" : "es"} ·{" "}
                <button
                  type="button"
                  onClick={() => setFitRequest((n) => n + 1)}
                  className="text-ink underline-offset-2 hover:underline"
                >
                  Show {matchCount === 1 ? "it" : "them"}
                </button>
              </>
            ))}
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Link
            href={settingsHref}
            title="New documents without a category or folder are sorted by AI. Change this in Settings."
            className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-ink-soft transition-colors hover:bg-muted/60 hover:text-ink"
          >
            <Sparkles className="size-3" />
            Auto-sort {autoSortEnabled ? "on" : "off"}
          </Link>
        </div>
      </div>

      <div
        className={cn(
          "sorting-map relative overflow-hidden rounded-xl border border-border",
          MAP_HEIGHT
        )}
      >
        {/* Keyed by view so each view opens fitted, with its own viewport. */}
        <ReactFlowProvider key={view}>
          <MapCanvas
            view={view}
            docs={docs}
            categories={categories}
            folders={folders}
            divisions={divisions}
            sortingIds={sortingIds}
            onSortDocuments={onSortDocuments}
            query={query}
            fitRequest={fitRequest}
            onMove={moveDocument}
            onOpenDocument={onOpenDocument}
            onEditDocument={onEditDocument}
            onShowInList={onShowInList}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

interface MapCanvasProps {
  view: MapView;
  docs: Document[];
  categories: Category[];
  folders: Folder[];
  divisions: EventCalendar[];
  sortingIds: ReadonlySet<string>;
  onSortDocuments: (docIds: string[]) => void;
  query: string;
  fitRequest: number;
  onMove: (doc: Document, to: TreeNode<Document>) => void;
  onOpenDocument: (doc: Document) => void;
  onEditDocument: (doc: Document) => void;
  onShowInList: (view: MapView, targetId: string) => void;
}

function MapCanvas({
  view,
  docs,
  categories,
  folders,
  divisions,
  sortingIds,
  onSortDocuments,
  query,
  fitRequest,
  onMove,
  onOpenDocument,
  onEditDocument,
  onShowInList,
}: MapCanvasProps) {
  const { fitView } = useReactFlow<MapNode, LinkEdge>();
  const touch = useTouchScreen();
  const rootId = hubId(view);
  // The boxes the user has opened. The map starts with All documents open,
  // showing the whole school and each division.
  const [opened, setOpened] = useState<ReadonlySet<string>>(
    () => new Set([rootId])
  );
  // Sizes React Flow measured, handed back on every render so it doesn't hide
  // the boxes to measure them again.
  const [measured, setMeasured] = useState<Record<string, Dimensions>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // The boxes to bring into view once the next layout is on screen.
  const [focus, setFocus] = useState<{ ids: string[]; seq: number } | null>(
    null
  );

  const mapDivisions = useMemo<MapDivision[]>(
    () =>
      divisions.map((d) => ({
        id: d.id,
        name: d.name,
        sort_order: d.sort_order,
        color: calendarHex(d.color),
      })),
    [divisions]
  );
  const tree = useMemo(
    () =>
      buildTree(
        view,
        view === "category"
          ? groupByDivision(docs, categories, mapDivisions)
          : groupByFolder(docs, folders)
      ),
    [view, docs, categories, mapDivisions, folders]
  );
  const parents = useMemo(() => parentsOf(tree), [tree]);
  const matched = useMemo(() => nodesWithMatches(tree, query), [tree, query]);
  // While searching, everything on the way to a match opens as well.
  const open = useMemo(() => {
    const forMatches = openForMatches(tree, query);
    return forMatches.size ? new Set([...opened, ...forMatches]) : opened;
  }, [tree, query, opened]);
  const layout = useMemo(() => layoutTree(tree, open), [tree, open]);

  const nodes = useMemo<MapNode[]>(
    () =>
      layout.nodes.map((node): MapNode => {
        const box = layout.boxes.get(node.id);
        const common = {
          id: node.id,
          position: { x: box?.x ?? 0, y: box?.y ?? 0 },
          width: box?.width,
          height: box?.height,
          measured: measured[node.id],
          style: NODE_STYLE,
          domAttributes: PLAIN_WRAPPER,
        };
        return node.kind === "list"
          ? { ...common, type: "list", data: { node } }
          : {
              ...common,
              type: "box",
              data: { node, open: open.has(node.id), isRoot: node.id === rootId },
            };
      }),
    [layout, measured, open, rootId]
  );

  const edges = useMemo<LinkEdge[]>(() => {
    const colorOf = new Map(layout.nodes.map((n) => [n.id, n.color]));
    return layout.links.map((link) => {
      const lit =
        hovered !== null && (link.target === hovered || link.source === hovered);
      const found = query !== "" && matched.has(link.target);
      return {
        id: link.id,
        type: "link",
        source: link.source,
        sourceHandle: SOURCE_HANDLE_ID,
        target: link.target,
        targetHandle: TARGET_HANDLE_ID,
        data: {
          color: colorOf.get(link.target) ?? null,
          active: lit || found,
          dimmed: query !== "" && !found,
        },
      };
    });
  }, [layout, hovered, query, matched]);

  const onNodesChange = useCallback((changes: NodeChange<MapNode>[]) => {
    const sizes: Record<string, Dimensions> = {};
    for (const change of changes) {
      if (change.type === "dimensions" && change.dimensions) {
        sizes[change.id] = change.dimensions;
      }
    }
    if (Object.keys(sizes).length) {
      setMeasured((prev) => ({ ...prev, ...sizes }));
    }
  }, []);

  /** Open or close a box, then bring it and what it opened into view. */
  const toggle = useCallback(
    (id: string) => {
      const node = layout.nodes.find((n) => n.id === id);
      if (!node) return;
      const closing = open.has(id);
      setOpened((prev) => {
        const next = new Set(prev);
        if (closing) {
          // Closing a box closes everything beneath it too.
          const below = [node];
          while (below.length) {
            const current = below.pop()!;
            next.delete(current.id);
            below.push(...current.children);
          }
        } else {
          next.add(id);
        }
        return next;
      });
      const parent = parents.get(id);
      const ids = closing
        ? [id, ...(parent ? [parent] : [])]
        : [id, ...node.children.map((c) => c.id)];
      setFocus((prev) => ({ ids, seq: (prev?.seq ?? 0) + 1 }));
    },
    [layout, open, parents]
  );

  // Once the new layout is drawn, bring the boxes just opened into view.
  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() => {
      void fitView({
        nodes: focus.ids.map((id) => ({ id })),
        padding: 0.25,
        maxZoom: 1,
        duration: motionMs(400),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus, fitView]);

  // Bring the search matches into view when the toolbar asks for it.
  const handledFitRequest = useRef(fitRequest);
  useEffect(() => {
    if (fitRequest === handledFitRequest.current) return;
    handledFitRequest.current = fitRequest;
    const lists = layout.nodes.filter(
      (n) => n.kind === "list" && matched.has(n.id)
    );
    if (!lists.length) return;
    void fitView({
      nodes: lists.map((n) => ({ id: n.id })),
      padding: 0.25,
      maxZoom: 1,
      duration: motionMs(450),
    });
  }, [fitRequest, layout, matched, fitView]);

  const categoryColor = useMemo(() => {
    const colors = new Map(categories.map((c) => [c.id, c.color]));
    return (id: string | null) => (id ? (colors.get(id) ?? null) : null);
  }, [categories]);

  const context = useMemo<SortingMapContextValue>(
    () => ({
      view,
      query,
      matched,
      touch,
      categoryColor,
      dropTarget,
      sorting: sortingIds,
      sortDocuments: onSortDocuments,
      setHovered,
      toggle,
      openDocument: onOpenDocument,
      editDocument: onEditDocument,
      showInList: (node) => {
        if (node.targetId) onShowInList(view, node.targetId);
      },
      endDrag: () => setDropTarget(null),
      dragOver: (id) => setDropTarget(id),
      dragLeave: (id) =>
        setDropTarget((current) => (current === id ? null : current)),
      drop: (docId, node) => {
        // Look the document up fresh: the drag may have outlived the row.
        const doc = docs.find((d) => d.id === docId);
        if (doc) onMove(doc, node);
      },
    }),
    [
      view,
      query,
      matched,
      touch,
      categoryColor,
      dropTarget,
      sortingIds,
      onSortDocuments,
      toggle,
      onOpenDocument,
      onEditDocument,
      onShowInList,
      docs,
      onMove,
    ]
  );

  return (
    <SortingMapContext.Provider value={context}>
      <ReactFlow<MapNode, LinkEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={FIT_VIEW}
        minZoom={0.1}
        maxZoom={1.75}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        disableKeyboardA11y
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        panActivationKeyCode={null}
        panOnScroll
        zoomOnDoubleClick={false}
        attributionPosition="top-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.25} />
        <Controls position="bottom-left" showInteractive={false}>
          <ControlButton
            onClick={() => {
              setOpened(new Set([rootId]));
              setFocus((prev) => ({
                ids: [rootId, ...tree.children.map((c) => c.id)],
                seq: (prev?.seq ?? 0) + 1,
              }));
            }}
            title="Close everything below the divisions"
            aria-label="Close everything below the divisions"
          >
            {/* React Flow fills control icons; this one is drawn in strokes. */}
            <ChevronsDownUp style={{ fill: "none" }} />
          </ControlButton>
        </Controls>
        <Panel
          position="bottom-center"
          className="pointer-events-none rounded-full bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-[var(--elev-2)] ring-1 ring-border max-md:hidden"
        >
          Click a box to open it, click again to close it · Drag a document onto
          another box to re-sort it
        </Panel>
      </ReactFlow>
    </SortingMapContext.Provider>
  );
}
