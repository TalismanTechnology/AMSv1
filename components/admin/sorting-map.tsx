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
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Dimensions,
  type FitViewOptions,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import {
  Diamond,
  FileText,
  Folder as FolderIcon,
  GraduationCap,
  Mail,
  Network,
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
  bucketsWithMatches,
  groupByDivision,
  groupByFolder,
  hubBuckets,
  hubId,
  layoutMap,
  matchesQuery,
  normalizeQuery,
  type Bucket,
  type MapDivision,
  type MapView,
} from "@/lib/documents/sorting-map";
import {
  CARD_FOCUS_ATTRIBUTE,
  DRAG_HANDLE_CLASS,
  SOURCE_HANDLE_ID,
  SortingMapContext,
  TARGET_HANDLE_ID,
  edgeTypes,
  nodeTypes,
  type BucketNode,
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
    (doc: Document, to: Bucket<Document>) => {
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
          <span className="flex items-center gap-1.5">
            <Diamond className="size-3 fill-current text-ink-soft" />
            In a category
          </span>
          <span className="flex items-center gap-1.5">
            <Diamond className="size-3" />
            No category
          </span>
          <span className="flex items-center gap-1.5">
            <Mail className="size-3" />
            Came by email
          </span>
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
  onMove: (doc: Document, to: Bucket<Document>) => void;
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
  const { fitView, getViewport, setViewport } = useReactFlow<
    MapNode,
    LinkEdge
  >();
  const touch = useTouchScreen();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  // How far each card has been dragged from where the layout put it, so a
  // re-layout (a card expanding, a document moving) keeps the user's edits.
  const [offsets, setOffsets] = useState<Record<string, XYPosition>>({});
  // Sizes React Flow measured, handed back on every render so it doesn't hide
  // the cards to measure them again.
  const [measured, setMeasured] = useState<Record<string, Dimensions>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

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
  const buckets = useMemo(
    () =>
      view === "category"
        ? groupByDivision(docs, categories, mapDivisions)
        : groupByFolder(docs, folders),
    [view, docs, categories, mapDivisions, folders]
  );
  const layout = useMemo(
    () => layoutMap(view, buckets, expanded),
    [view, buckets, expanded]
  );
  const matched = useMemo(
    () => bucketsWithMatches(buckets, query),
    [buckets, query]
  );

  const nodes = useMemo<MapNode[]>(() => {
    const placeOf = (id: string): XYPosition => {
      const box = layout.boxes.get(id);
      const offset = offsets[id];
      return {
        x: (box?.x ?? 0) + (offset?.x ?? 0),
        y: (box?.y ?? 0) + (offset?.y ?? 0),
      };
    };

    const hub = hubId(view);
    return [
      {
        id: hub,
        type: "hub",
        position: placeOf(hub),
        dragHandle: `.${DRAG_HANDLE_CLASS}`,
        measured: measured[hub],
        style: NODE_STYLE,
        domAttributes: PLAIN_WRAPPER,
        data: {
          view,
          total: docs.length,
          branchCount: hubBuckets(buckets).length,
        },
      },
      ...buckets.map(
        (bucket): BucketNode => ({
          id: bucket.id,
          type: "bucket",
          position: placeOf(bucket.id),
          dragHandle: `.${DRAG_HANDLE_CLASS}`,
          measured: measured[bucket.id],
          style: NODE_STYLE,
          domAttributes: PLAIN_WRAPPER,
          data: { bucket, expanded: expanded.has(bucket.id) },
        })
      ),
    ];
  }, [view, buckets, layout, offsets, measured, expanded, docs.length]);

  const edges = useMemo<LinkEdge[]>(() => {
    const colorOf = new Map(buckets.map((b) => [b.id, b.color]));
    return layout.links.map((link) => {
      const lit =
        hovered !== null &&
        (link.target === hovered || link.source === hovered);
      const found = query !== "" && matched.has(link.target);
      return {
        id: link.id,
        type: "link",
        source: link.source,
        sourceHandle: SOURCE_HANDLE_ID,
        target: link.target,
        targetHandle: TARGET_HANDLE_ID,
        data: {
          busY: link.busY,
          color: colorOf.get(link.target) ?? null,
          active: lit || found,
          dimmed: query !== "" && !found,
        },
      };
    });
  }, [layout, buckets, hovered, query, matched]);

  const onNodesChange = useCallback(
    (changes: NodeChange<MapNode>[]) => {
      const sizes: Record<string, Dimensions> = {};
      const moved: Record<string, XYPosition> = {};
      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions) {
          sizes[change.id] = change.dimensions;
        } else if (change.type === "position" && change.position) {
          const box = layout.boxes.get(change.id);
          if (box) {
            moved[change.id] = {
              x: change.position.x - box.x,
              y: change.position.y - box.y,
            };
          }
        }
      }
      if (Object.keys(sizes).length) {
        setMeasured((prev) => ({ ...prev, ...sizes }));
      }
      if (Object.keys(moved).length) {
        setOffsets((prev) => ({ ...prev, ...moved }));
      }
    },
    [layout]
  );

  /** Bring a card into view, then move keyboard focus into it. */
  const focusCard = useCallback(
    (id: string) => {
      void fitView({
        nodes: [{ id }],
        padding: 0.4,
        maxZoom: 1,
        duration: motionMs(450),
      }).then(() => {
        document
          .querySelector<HTMLElement>(
            `.react-flow__node[data-id="${CSS.escape(id)}"] [${CARD_FOCUS_ATTRIBUTE}]`
          )
          ?.focus({ preventScroll: true });
      });
    },
    [fitView]
  );

  // Keyboard focus can land on a row of a card that's partly off the canvas.
  // Pan just far enough to show it.
  const revealFocused = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches(":focus-visible") || !target.closest(".react-flow__node")) {
        return;
      }
      const canvas = event.currentTarget.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      const margin = 24;
      const shift = (start: number, end: number, from: number, to: number) =>
        start < from + margin
          ? from + margin - start
          : end > to - margin
            ? to - margin - end
            : 0;
      const dx = shift(box.left, box.right, canvas.left, canvas.right);
      const dy = shift(box.top, box.bottom, canvas.top, canvas.bottom);
      if (!dx && !dy) return;
      const viewport = getViewport();
      void setViewport(
        { x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom },
        { duration: motionMs(200) }
      );
    },
    [getViewport, setViewport]
  );

  // Bring the search matches into view when the toolbar asks for it.
  const handledFitRequest = useRef(fitRequest);
  useEffect(() => {
    if (fitRequest === handledFitRequest.current) return;
    handledFitRequest.current = fitRequest;
    if (!matched.size) return;
    void fitView({
      nodes: [...matched].map((id) => ({ id })),
      padding: 0.2,
      maxZoom: 1,
      duration: motionMs(450),
    });
  }, [fitRequest, matched, fitView]);

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
      dragFrom,
      dropTarget,
      sorting: sortingIds,
      sortDocuments: onSortDocuments,
      setHovered,
      focusCard,
      toggleExpanded: (id) =>
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      openDocument: onOpenDocument,
      editDocument: onEditDocument,
      showInList: (bucket) => {
        if (bucket.targetId) onShowInList(view, bucket.targetId);
      },
      startDrag: (from) => setDragFrom(from),
      endDrag: () => {
        setDragFrom(null);
        setDropTarget(null);
      },
      dragOver: (id) => setDropTarget(id),
      dragLeave: (id) =>
        setDropTarget((current) => (current === id ? null : current)),
      drop: (docId, bucket) => {
        // Look the document up fresh: the drag may have outlived the row.
        const doc = docs.find((d) => d.id === docId);
        if (doc) onMove(doc, bucket);
      },
    }),
    [
      view,
      query,
      matched,
      touch,
      categoryColor,
      dragFrom,
      dropTarget,
      sortingIds,
      onSortDocuments,
      focusCard,
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
        onFocus={revealFocused}
        fitView
        fitViewOptions={FIT_VIEW}
        minZoom={0.1}
        maxZoom={1.75}
        nodesDraggable={!touch}
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
              setOffsets({});
              void fitView({ ...FIT_VIEW, duration: motionMs(450) });
            }}
            title="Put every card back in the tree"
            aria-label="Put every card back in the tree"
          >
            {/* React Flow fills control icons; this one is drawn in strokes. */}
            <Network style={{ fill: "none" }} />
          </ControlButton>
        </Controls>
        <MiniMap<MapNode>
          position="bottom-right"
          pannable
          zoomable
          nodeBorderRadius={4}
          nodeColor={(node) =>
            node.type === "bucket" && node.data.bucket.color
              ? node.data.bucket.color
              : "rgba(45, 58, 46, 0.22)"
          }
          ariaLabel="Map overview"
          className="max-md:hidden"
        />
        <Panel
          position="bottom-center"
          className="pointer-events-none rounded-full bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-[var(--elev-2)] ring-1 ring-border max-md:hidden"
        >
          Drag a document onto another card to re-sort it
        </Panel>
      </ReactFlow>
    </SortingMapContext.Provider>
  );
}
