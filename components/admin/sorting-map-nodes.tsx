"use client";

import { createContext, useContext, useEffect, useRef, type DragEvent } from "react";
import {
  BaseEdge,
  Handle,
  Position,
  getSmoothStepPath,
  useUpdateNodeInternals,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Diamond,
  EllipsisVertical,
  Folder as FolderIcon,
  Inbox,
  Library,
  ListFilter,
  Mail,
  Pencil,
  Tag,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  CARD_WIDTH,
  PREVIEW_ROWS,
  hasMoreRow,
  matchesQuery,
  roundedPath,
  routeLink,
  rowHandleId,
  type Bucket,
  type MapLink,
  type MapView,
} from "@/lib/documents/sorting-map";
import type { Document } from "@/lib/types";

// Headers are h-[40px] and rows h-[34px] to match HEADER_HEIGHT and
// ROW_HEIGHT in lib/documents/sorting-map.ts, which places cards before they
// are measured. They are px, not rem, so a larger browser font can't make the
// cards outgrow their places.
//
// Cards use bg-[var(--card)], never the bg-card class: the dashboard's
// `.neo .bg-card` rules would make them position: relative with a solid
// border and their own shadow.

/** Only a card's header drags the card; its rows drag documents instead. */
export const DRAG_HANDLE_CLASS = "sorting-map-drag";
/** The handle on a card's header that links arrive at. */
export const TARGET_HANDLE_ID = "in";
/** Marks the element "Go to" focuses once it has brought a card into view. */
export const CARD_FOCUS_ATTRIBUTE = "data-map-card";
const DRAG_TYPE = "application/x-askmyschool-document";

export type HubNode = Node<
  { view: MapView; rows: Bucket<Document>[]; total: number },
  "hub"
>;
export type BucketNode = Node<
  {
    bucket: Bucket<Document>;
    expanded: boolean;
    /** Folder view: the folders listed as rows, which link to their cards. */
    subfolders: Bucket<Document>[];
  },
  "bucket"
>;
export type MapNode = HubNode | BucketNode;

export type LinkEdge = Edge<
  {
    gutter: number;
    overhead?: MapLink["overhead"];
    /** The target category's colour, used while the link is lit. */
    color: string | null;
    active: boolean;
    dimmed: boolean;
  },
  "link"
>;

export interface SortingMapContextValue {
  view: MapView;
  /** Normalized search text; "" when not searching. */
  query: string;
  /** Buckets with a match in or beneath them, while searching. */
  matched: ReadonlySet<string>;
  /** Touch screens pan by swiping cards and edit with a visible button. */
  touch: boolean;
  categoryColor: (categoryId: string | null) => string | null;
  /** The bucket a document is being dragged out of, if any. */
  dragFrom: string | null;
  /** The bucket a dragged document is over. */
  dropTarget: string | null;
  setHovered: (bucketId: string | null) => void;
  focusCard: (bucketId: string) => void;
  toggleExpanded: (bucketId: string) => void;
  openDocument: (doc: Document) => void;
  editDocument: (doc: Document) => void;
  showInList: (bucket: Bucket<Document>) => void;
  startDrag: (fromBucketId: string) => void;
  endDrag: () => void;
  dragOver: (bucketId: string | null) => void;
  drop: (docId: string, bucket: Bucket<Document>) => void;
}

export const SortingMapContext = createContext<SortingMapContextValue | null>(
  null
);

function useSortingMap(): SortingMapContextValue {
  const context = useContext(SortingMapContext);
  if (!context) throw new Error("Sorting map nodes need a SortingMapContext");
  return context;
}

/** Whether a drag carries a document from this map, not a file or text. */
function carriesDocument(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(DRAG_TYPE);
}

/** Lets a card or row take a document dragged from another card. */
function useDropTarget(bucket: Bucket<Document>) {
  const map = useSortingMap();
  const accepts = map.dragFrom !== bucket.id;

  return {
    isOver: accepts && map.dropTarget === bucket.id,
    handlers: {
      onDragOver(event: DragEvent) {
        if (!carriesDocument(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = accepts ? "move" : "none";
        map.dragOver(accepts ? bucket.id : null);
      },
      onDragLeave(event: DragEvent) {
        const next = event.relatedTarget;
        if (next instanceof Element && event.currentTarget.contains(next)) return;
        map.dragOver(null);
      },
      onDrop(event: DragEvent) {
        if (!carriesDocument(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const docId = event.dataTransfer.getData(DRAG_TYPE);
        if (accepts && docId) map.drop(docId, bucket);
        map.endDrag();
      },
    },
  };
}

/**
 * React Flow keeps a card's handle positions until the card resizes. When rows
 * that carry handles are added, removed or reordered at the same height (a
 * category deleted, a folder renamed), have it measure them again.
 */
function useRowHandleRefresh(nodeId: string, rows: Bucket<Document>[]) {
  const updateNodeInternals = useUpdateNodeInternals();
  const handles = rows.map((row) => row.id).join("|");
  const measured = useRef(handles);
  useEffect(() => {
    if (measured.current === handles) return;
    measured.current = handles;
    updateNodeInternals(nodeId);
  }, [nodeId, handles, updateNodeInternals]);
}

/** On touch screens rows must not block panning; there is no mouse drag. */
function rowClass(touch: boolean) {
  return cn(
    "relative h-[34px] border-b border-border/60 last:border-b-0",
    !touch && "nodrag nopan"
  );
}
const rowButtonClass =
  "flex h-full w-full items-center gap-2.5 px-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const countClass =
  "shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground";

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function CardShell({
  label,
  dashed,
  dimmed,
  className,
  children,
  ...rest
}: React.ComponentProps<"div"> & {
  /** Read out when focus enters the card. */
  label: string;
  dashed?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={-1}
      {...{ [CARD_FOCUS_ATTRIBUTE]: "" }}
      style={{ width: CARD_WIDTH }}
      className={cn(
        // No outline-none here: it would also cancel the drop-target outline.
        "overflow-hidden rounded-lg border bg-[var(--card)] shadow-[var(--elev-2)] transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        dashed ? "border-dashed border-foreground/30" : "border-border",
        dimmed && "opacity-40",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon,
  name,
  count,
  countTitle,
  accent,
  children,
}: {
  icon: React.ReactNode;
  name: string;
  count: number;
  countTitle: string;
  accent?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        DRAG_HANDLE_CLASS,
        "relative flex h-[40px] cursor-grab items-center gap-2 border-b border-border pl-3 pr-1.5 active:cursor-grabbing"
      )}
      style={accent ? { boxShadow: `inset 0 2px 0 ${accent}` } : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id={TARGET_HANDLE_ID}
        isConnectable={false}
      />
      {icon}
      <span
        className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink"
        title={name}
      >
        {name}
      </span>
      <span className={cn(countClass, !children && "pr-1.5")} title={countTitle}>
        {count}
      </span>
      {children}
    </div>
  );
}

function PlaceholderRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex h-[34px] items-center px-3 text-[12px] text-muted-foreground">
      {children}
    </li>
  );
}

// ── Hub ───────────────────────────────────────────────

function HubCard({ id, data }: NodeProps<HubNode>) {
  useRowHandleRefresh(id, data.rows);

  return (
    <CardShell label={`All documents, ${plural(data.total, "document")}`}>
      <CardHeader
        icon={<Library className="size-3.5 shrink-0 text-ink-soft" />}
        name="All documents"
        count={data.total}
        countTitle={plural(data.total, "document")}
      />
      <ul>
        {data.rows.map((bucket) => (
          <HubRow key={bucket.id} bucket={bucket} />
        ))}
        {data.rows.length === 0 && (
          <PlaceholderRow>
            {data.view === "category" ? "No categories yet" : "No folders yet"}
          </PlaceholderRow>
        )}
      </ul>
    </CardShell>
  );
}

function HubRow({ bucket }: { bucket: Bucket<Document> }) {
  const map = useSortingMap();
  const drop = useDropTarget(bucket);
  const dimmed = map.query !== "" && !map.matched.has(bucket.id);

  return (
    <li
      {...drop.handlers}
      onMouseEnter={() => map.setHovered(bucket.id)}
      onMouseLeave={() => map.setHovered(null)}
      className={cn(
        rowClass(map.touch),
        dimmed && "opacity-40",
        drop.isOver && "bg-[var(--ember-soft)]"
      )}
    >
      <button
        type="button"
        onClick={() => map.focusCard(bucket.id)}
        title={`Go to ${bucket.name}`}
        className={rowButtonClass}
      >
        <RowIcon bucket={bucket} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
          {bucket.name}
        </span>
        <span className={countClass}>{bucket.total}</span>
      </button>
      <Handle
        type="source"
        position={Position.Right}
        id={rowHandleId(bucket.id)}
        isConnectable={false}
      />
    </li>
  );
}

/** The small mark a bucket gets where it is listed as a row. */
function RowIcon({ bucket }: { bucket: Bucket<Document> }) {
  if (bucket.kind === "folder") {
    return <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  return (
    <Diamond
      aria-hidden
      className={cn(
        "size-3 shrink-0",
        bucket.color ? "fill-current" : "text-muted-foreground/70"
      )}
      style={bucket.color ? { color: bucket.color } : undefined}
    />
  );
}

// ── Category / folder cards ───────────────────────────

function cardLabel(bucket: Bucket<Document>, subfolders: number): string {
  const documents = plural(bucket.total, "document");
  if (bucket.kind === "category") return `${bucket.name}, category, ${documents}`;
  if (bucket.kind === "unsorted") return `${bucket.name}, ${documents}`;
  return subfolders
    ? `${bucket.name}, folder, ${documents} including ${plural(subfolders, "subfolder")}`
    : `${bucket.name}, folder, ${documents}`;
}

function BucketCard({ id, data }: NodeProps<BucketNode>) {
  const { bucket, expanded, subfolders } = data;
  const map = useSortingMap();
  const drop = useDropTarget(bucket);
  const searching = map.query !== "";
  useRowHandleRefresh(id, subfolders);

  // While searching, matches come first so a folded card still shows them.
  const docs = searching
    ? [
        ...bucket.docs.filter((d) => matchesQuery(d, map.query)),
        ...bucket.docs.filter((d) => !matchesQuery(d, map.query)),
      ]
    : bucket.docs;
  const shown = expanded ? docs : docs.slice(0, PREVIEW_ROWS);
  const direct = bucket.docs.length;

  return (
    <CardShell
      label={cardLabel(bucket, subfolders.length)}
      dashed={bucket.kind === "unsorted"}
      dimmed={searching && !map.matched.has(bucket.id)}
      {...drop.handlers}
      onMouseEnter={() => map.setHovered(bucket.id)}
      onMouseLeave={() => map.setHovered(null)}
      className={cn(
        drop.isOver && "outline-2 outline-offset-2 outline-ring"
      )}
    >
      <CardHeader
        icon={<CardIcon bucket={bucket} />}
        name={bucket.name}
        // Like the hub and subfolder rows: everything at or beneath here.
        count={bucket.total}
        countTitle={
          subfolders.length
            ? `${plural(bucket.total, "document")}: ${direct} here, the rest in subfolders`
            : plural(bucket.total, "document")
        }
        accent={bucket.color}
      >
        <CardMenu bucket={bucket} expanded={expanded} />
      </CardHeader>
      <ul>
        {subfolders.map((child) => (
          <SubfolderRow key={child.id} bucket={child} parentId={bucket.id} />
        ))}
        {shown.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} bucketId={bucket.id} />
        ))}
        {hasMoreRow(bucket) && (
          <li className={cn(!map.touch && "nodrag nopan")}>
            <button
              type="button"
              onClick={() => map.toggleExpanded(bucket.id)}
              className="flex h-[34px] w-full items-center gap-1.5 px-3 text-[12px] text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-ink focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-3.5" />
                  Show fewer
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" />
                  Show all {direct}
                </>
              )}
            </button>
          </li>
        )}
        {subfolders.length === 0 && direct === 0 && (
          <PlaceholderRow>
            {bucket.kind === "folder" ? "Empty folder" : "No documents yet"}
          </PlaceholderRow>
        )}
      </ul>
    </CardShell>
  );
}

function CardIcon({ bucket }: { bucket: Bucket<Document> }) {
  if (bucket.kind === "category") {
    return (
      <Tag
        className="size-3.5 shrink-0"
        style={bucket.color ? { color: bucket.color } : undefined}
      />
    );
  }
  if (bucket.kind === "folder") {
    return <FolderIcon className="size-3.5 shrink-0 text-ink-soft" />;
  }
  return <Inbox className="size-3.5 shrink-0 text-muted-foreground" />;
}

function CardMenu({
  bucket,
  expanded,
}: {
  bucket: Bucket<Document>;
  expanded: boolean;
}) {
  const map = useSortingMap();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${bucket.name} options`}
          className="nodrag nopan flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-ink focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <EllipsisVertical className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => map.focusCard(bucket.id)}>
          <Crosshair className="mr-2 h-4 w-4" />
          Zoom to card
        </DropdownMenuItem>
        {hasMoreRow(bucket) && (
          <DropdownMenuItem onClick={() => map.toggleExpanded(bucket.id)}>
            {expanded ? (
              <ChevronUp className="mr-2 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-2 h-4 w-4" />
            )}
            {expanded ? "Show fewer" : `Show all ${bucket.docs.length}`}
          </DropdownMenuItem>
        )}
        {bucket.targetId && (
          <DropdownMenuItem onClick={() => map.showInList(bucket)}>
            <ListFilter className="mr-2 h-4 w-4" />
            Show in list
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SubfolderRow({
  bucket,
  parentId,
}: {
  bucket: Bucket<Document>;
  parentId: string;
}) {
  const map = useSortingMap();
  const drop = useDropTarget(bucket);
  const dimmed = map.query !== "" && !map.matched.has(bucket.id);

  return (
    <li
      {...drop.handlers}
      onMouseEnter={() => map.setHovered(bucket.id)}
      onMouseLeave={() => map.setHovered(parentId)}
      className={cn(
        rowClass(map.touch),
        dimmed && "opacity-40",
        drop.isOver && "bg-[var(--ember-soft)]"
      )}
    >
      <button
        type="button"
        onClick={() => map.focusCard(bucket.id)}
        title={`Go to ${bucket.name}`}
        className={rowButtonClass}
      >
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
          {bucket.name}
        </span>
        <span className={countClass}>{bucket.total}</span>
      </button>
      <Handle
        type="source"
        position={Position.Right}
        id={rowHandleId(bucket.id)}
        isConnectable={false}
      />
    </li>
  );
}

function statusOf(doc: Document): string {
  switch (doc.status) {
    case "processing":
      return "Processing";
    case "pending":
      return "Waiting for approval";
    case "error":
      return doc.error_message ? `Error: ${doc.error_message}` : "Error";
    default:
      return "Ready";
  }
}

function DocumentRow({ doc, bucketId }: { doc: Document; bucketId: string }) {
  const map = useSortingMap();
  const color = map.categoryColor(doc.category_id);
  const hit = map.query ? matchesQuery(doc, map.query) : null;
  const notReady = doc.status === "ready" ? null : doc.status;
  const facts = [
    `${doc.file_type.toUpperCase()} file`,
    statusOf(doc),
    doc.source === "email" ? "Came by email" : null,
  ].filter(Boolean);

  return (
    <li
      className={cn(rowClass(map.touch), "group/row", hit === false && "opacity-40")}
    >
      {/* A div, not a button: Firefox won't start a drag from a button. */}
      <div
        role="button"
        tabIndex={0}
        draggable={!map.touch}
        aria-label={[doc.title, ...facts].join(", ")}
        title={`${doc.title}\n${facts.join(" · ")}`}
        onClick={() => map.openDocument(doc)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            map.openDocument(doc);
          }
        }}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, doc.id);
          event.dataTransfer.effectAllowed = "move";
          map.startDrag(bucketId);
        }}
        onDragEnd={map.endDrag}
        className={cn(rowButtonClass, "cursor-pointer select-none")}
      >
        <Diamond
          aria-hidden
          className={cn(
            "size-3 shrink-0",
            color ? "fill-current" : "text-muted-foreground/70"
          )}
          style={color ? { color } : undefined}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            hit ? "font-medium text-ink" : "text-ink-soft"
          )}
        >
          {doc.title}
        </span>
        {doc.source === "email" && (
          <Mail aria-hidden className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span
          className={cn(
            "shrink-0 font-mono text-[11px] lowercase",
            notReady === "error"
              ? "text-destructive"
              : notReady
                ? "text-amber-700"
                : "text-muted-foreground"
          )}
        >
          {notReady ?? doc.file_type}
        </span>
      </div>
      <button
        type="button"
        onClick={() => map.editDocument(doc)}
        aria-label={`Edit ${doc.title}`}
        title="Edit"
        className={cn(
          "absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md bg-[var(--card)] text-muted-foreground ring-1 ring-border outline-none transition-opacity hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100",
          map.touch ? "opacity-100" : "opacity-0"
        )}
      >
        <Pencil className="size-3" />
      </button>
    </li>
  );
}

// ── Links ─────────────────────────────────────────────

function LinkLine({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<LinkEdge>) {
  // Links turn only in the gaps between cards, so they never run behind one;
  // links that share a gap merge into a single trunk there.
  const corners = routeLink(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    { gutter: data?.gutter ?? 0, overhead: data?.overhead }
  );
  const path = corners
    ? roundedPath(corners, 8)
    : getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 8,
      })[0];

  return (
    <BaseEdge
      id={id}
      path={path}
      interactionWidth={0}
      className={cn(
        "sorting-map-link",
        data?.active && "is-active",
        data?.dimmed && "is-dimmed"
      )}
      style={data?.active && data.color ? { stroke: data.color } : undefined}
    />
  );
}

export const nodeTypes = {
  hub: HubCard,
  bucket: BucketCard,
} satisfies NodeTypes;

export const edgeTypes = { link: LinkLine } satisfies EdgeTypes;
