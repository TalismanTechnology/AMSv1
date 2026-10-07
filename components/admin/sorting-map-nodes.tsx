"use client";

import { createContext, useContext, type DragEvent } from "react";
import {
  BaseEdge,
  Handle,
  Position,
  getStraightPath,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  Diamond,
  EllipsisVertical,
  FileSpreadsheet,
  FileText,
  Folder as FolderIcon,
  GraduationCap,
  Inbox,
  Library,
  ListFilter,
  LoaderCircle,
  Mail,
  Pencil,
  Presentation,
  School,
  Sparkles,
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
  LIST_ROWS,
  matchesQuery,
  type MapView,
  type TreeNode,
} from "@/lib/documents/sorting-map";
import type { Document } from "@/lib/types";

// Boxes are drawn to NODE_WIDTH × NODE_HEIGHT (232 × 60) and list rows to ROW_HEIGHT in
// lib/documents/sorting-map.ts, which places them before they are measured.
// Sizes are px, not rem, so a larger browser font can't outgrow the layout.
//
// Boxes use bg-[var(--card)], never the bg-card class: the dashboard's
// `.neo .bg-card` rules would give them their own border and shadow.

/** The handle on top of a box that the line from its parent arrives at. */
export const TARGET_HANDLE_ID = "in";
/** The handle under a box that lines to its children leave from. */
export const SOURCE_HANDLE_ID = "out";
/** Marks the element focus moves to once the map has brought a box into view. */
export const CARD_FOCUS_ATTRIBUTE = "data-map-card";
const DRAG_TYPE = "application/x-askmyschool-document";

export type TreeBoxNode = Node<
  { node: TreeNode<Document>; open: boolean; isRoot: boolean },
  "box"
>;
export type DocListNode = Node<{ node: TreeNode<Document> }, "list">;
export type MapNode = TreeBoxNode | DocListNode;

export type LinkEdge = Edge<
  {
    /** The child's colour, used while the line is lit. */
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
  /** Boxes with a match at or beneath them, while searching. */
  matched: ReadonlySet<string>;
  /** Touch screens pan by swiping and edit with a visible button. */
  touch: boolean;
  categoryColor: (categoryId: string | null) => string | null;
  /** The box a dragged document is over. */
  dropTarget: string | null;
  /** Documents being sorted by AI right now. */
  sorting: ReadonlySet<string>;
  sortDocuments: (docIds: string[]) => void;
  setHovered: (nodeId: string | null) => void;
  toggle: (nodeId: string) => void;
  openDocument: (doc: Document) => void;
  editDocument: (doc: Document) => void;
  showInList: (node: TreeNode<Document>) => void;
  endDrag: () => void;
  dragOver: (nodeId: string | null) => void;
  /** Clears the drop target, unless the pointer has already entered another. */
  dragLeave: (nodeId: string) => void;
  drop: (docId: string, node: TreeNode<Document>) => void;
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

/** Lets a box take a document dragged from a list. */
function useDropTarget(node: TreeNode<Document>) {
  const map = useSortingMap();
  if (!node.droppable) return { isOver: false, handlers: {} };

  // Entering the next target can come before leaving the last one, so a leave
  // only clears the target if it's still this one.
  const over = (event: DragEvent) => {
    if (!carriesDocument(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    map.dragOver(node.id);
  };

  return {
    isOver: map.dropTarget === node.id,
    handlers: {
      onDragEnter: over,
      onDragOver: over,
      onDragLeave(event: DragEvent) {
        const next = event.relatedTarget;
        if (next instanceof Element && event.currentTarget.contains(next)) return;
        map.dragLeave(node.id);
      },
      onDrop(event: DragEvent) {
        if (!carriesDocument(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const docId = event.dataTransfer.getData(DRAG_TYPE);
        if (docId) map.drop(docId, node);
        map.endDrag();
      },
    },
  };
}

function plural(count: number, noun: string, nouns = `${noun}s`) {
  return `${count} ${count === 1 ? noun : nouns}`;
}

/** What a box opens into, for its subtitle and screen readers. */
function opensInto(node: TreeNode<Document>): string {
  const kinds = new Set(node.children.map((c) => c.kind));
  if (node.kind === "type") return "the documents";
  if (kinds.has("division")) return plural(node.children.length, "group");
  if (kinds.has("category")) {
    return plural(node.children.length, "category", "categories");
  }
  if (kinds.has("folder")) return plural(node.children.length, "folder");
  return plural(node.children.length, "file type");
}

function BoxIcon({ node }: { node: TreeNode<Document> }) {
  const style = node.color ? { color: node.color } : undefined;
  const className = cn("size-4 shrink-0", !node.color && "text-ink-soft");
  switch (node.kind) {
    case "root":
      return <Library className={className} />;
    case "division":
      return node.id === "division:whole" ? (
        <School className={className} style={style} />
      ) : (
        <GraduationCap className={className} style={style} />
      );
    case "category":
      return <Tag className={className} style={style} />;
    case "folder":
      return <FolderIcon className={className} />;
    case "unsorted":
      return <Inbox className="size-4 shrink-0 text-muted-foreground" />;
    default:
      return <TypeIcon name={node.name} />;
  }
}

function TypeIcon({ name }: { name: string }) {
  const className = "size-4 shrink-0 text-ink-soft";
  if (name === "Email") return <Mail className={className} />;
  if (name === "Spreadsheet") return <FileSpreadsheet className={className} />;
  if (name === "Slides") return <Presentation className={className} />;
  return <FileText className={className} />;
}

// ── Boxes ─────────────────────────────────────────────

function TreeBox({ data }: NodeProps<TreeBoxNode>) {
  const { node, open, isRoot } = data;
  const map = useSortingMap();
  const drop = useDropTarget(node);
  const opens = node.children.length > 0;
  const dimmed = map.query !== "" && !map.matched.has(node.id);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div
      {...drop.handlers}
      onMouseEnter={() => map.setHovered(node.id)}
      onMouseLeave={() => map.setHovered(null)}
      className={cn(
        "group/box relative h-[60px] w-[232px] rounded-lg border bg-[var(--card)] shadow-[var(--elev-2)] transition-[opacity,box-shadow] duration-150",
        node.kind === "unsorted"
          ? "border-dashed border-foreground/30"
          : "border-border",
        open && "border-ink/30",
        dimmed && "opacity-40",
        drop.isOver && "outline-2 outline-offset-2 outline-ring"
      )}
      style={
        node.color
          ? { boxShadow: `inset 3px 0 0 ${node.color}, var(--elev-2)` }
          : undefined
      }
    >
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Top}
          id={TARGET_HANDLE_ID}
          isConnectable={false}
        />
      )}
      <button
        type="button"
        {...{ [CARD_FOCUS_ATTRIBUTE]: "" }}
        onClick={() => opens && map.toggle(node.id)}
        aria-expanded={opens ? open : undefined}
        aria-label={`${node.name}, ${plural(node.count, "document")}${
          opens ? `. ${open ? "Close" : "Open"} to ${open ? "hide" : "show"} ${opensInto(node)}` : ""
        }`}
        title={opens ? `${open ? "Close" : "Open"} ${node.name}` : node.name}
        className={cn(
          "flex h-full w-full items-center gap-2.5 rounded-lg pl-3.5 pr-7 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          opens ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
        )}
      >
        <BoxIcon node={node} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-tight text-ink">
            {node.name}
          </span>
          <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">
            {plural(node.count, "document")}
          </span>
        </span>
        {opens && (
          <Chevron
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        )}
      </button>
      <BoxMenu node={node} />
      {/* Always there when the box can open: React Flow only finds handles
          when it measures a box, not when one appears later. */}
      {opens && (
        <Handle
          type="source"
          position={Position.Bottom}
          id={SOURCE_HANDLE_ID}
          isConnectable={false}
        />
      )}
    </div>
  );
}

/** Show in list, and Sort with AI for unfiled documents. */
function BoxMenu({ node }: { node: TreeNode<Document> }) {
  const map = useSortingMap();
  const canList =
    !!node.targetId && (node.kind === "category" || node.kind === "folder");
  const toSort =
    node.kind === "unsorted" && map.view === "category"
      ? collectDocs(node)
          .filter((d) => d.status === "ready" && !map.sorting.has(d.id))
          .map((d) => d.id)
      : [];
  if (!canList && !toSort.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${node.name} options`}
          className={cn(
            "nodrag nopan absolute right-1 top-1 flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-opacity hover:bg-muted hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/box:opacity-100",
            map.touch ? "opacity-100" : "opacity-0"
          )}
        >
          <EllipsisVertical className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {toSort.length > 0 && (
          <DropdownMenuItem onClick={() => map.sortDocuments(toSort)}>
            <Sparkles className="mr-2 h-4 w-4" />
            Sort {toSort.length === 1 ? "it" : `all ${toSort.length}`} with AI
          </DropdownMenuItem>
        )}
        {canList && (
          <DropdownMenuItem onClick={() => map.showInList(node)}>
            <ListFilter className="mr-2 h-4 w-4" />
            Show in list
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function collectDocs(node: TreeNode<Document>): Document[] {
  if (node.kind === "type") return node.docs;
  return node.children.flatMap(collectDocs);
}

// ── Document lists ────────────────────────────────────

function DocList({ data }: NodeProps<DocListNode>) {
  const { node } = data;
  const map = useSortingMap();
  const drop = useDropTarget(node);
  const searching = map.query !== "";
  // While searching, matches come first so they're on show without scrolling.
  const docs = searching
    ? [
        ...node.docs.filter((d) => matchesQuery(d, map.query)),
        ...node.docs.filter((d) => !matchesQuery(d, map.query)),
      ]
    : node.docs;
  const sortable = !!node.unsorted && map.view === "category";

  return (
    <div
      role="group"
      aria-label={`${node.name} documents, ${docs.length}`}
      {...drop.handlers}
      className={cn(
        "w-[280px] overflow-hidden rounded-lg border border-border bg-[var(--card)] shadow-[var(--elev-2)]",
        drop.isOver && "outline-2 outline-offset-2 outline-ring"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        id={TARGET_HANDLE_ID}
        isConnectable={false}
      />
      <ul
        className={cn(
          "overflow-y-auto",
          docs.length > LIST_ROWS && "nowheel"
        )}
        style={{ maxHeight: LIST_ROWS * 34 }}
      >
        {docs.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} sortable={sortable} />
        ))}
      </ul>
    </div>
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

/** The small buttons that appear over a document row's file type on hover. */
const rowActionClass =
  "flex size-6 items-center justify-center rounded-md bg-[var(--card)] text-muted-foreground ring-1 ring-border outline-none transition-opacity hover:text-ink disabled:cursor-wait focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100";

function DocumentRow({
  doc,
  sortable,
}: {
  doc: Document;
  /** Offer "Sort with AI": an unfiled, ready document in the division view. */
  sortable: boolean;
}) {
  const map = useSortingMap();
  const color = map.categoryColor(doc.category_id);
  const hit = map.query ? matchesQuery(doc, map.query) : null;
  const sorting = map.sorting.has(doc.id);
  const canSort = sortable && doc.status === "ready";
  const notReady = sorting ? "sorting…" : doc.status === "ready" ? null : doc.status;
  const facts = [
    `${doc.file_type.toUpperCase()} file`,
    statusOf(doc),
    doc.source === "email" ? "Came by email" : null,
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "group/row relative h-[34px] border-b border-border/60 last:border-b-0",
        !map.touch && "nodrag nopan",
        hit === false && "opacity-40"
      )}
    >
      {/* A div, not a button: Firefox won't start a drag from a button. */}
      <div
        role="button"
        tabIndex={0}
        draggable={!map.touch}
        aria-label={[doc.title, ...facts].join(", ")}
        title={`${doc.title}\n${facts.join(" · ")}\nDrag onto another box to re-sort it`}
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
        }}
        onDragEnd={map.endDrag}
        className="flex h-full w-full cursor-pointer select-none items-center gap-2.5 px-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
        {notReady && (
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] lowercase",
              notReady === "error" ? "text-destructive" : "text-amber-700"
            )}
          >
            {notReady}
          </span>
        )}
      </div>
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-1">
        {canSort && (
          <button
            type="button"
            onClick={() => map.sortDocuments([doc.id])}
            disabled={sorting}
            aria-label={`Sort ${doc.title} with AI`}
            title="Sort with AI"
            className={cn(rowActionClass, map.touch || sorting ? "opacity-100" : "opacity-0")}
          >
            {sorting ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => map.editDocument(doc)}
          aria-label={`Edit ${doc.title}`}
          title="Edit"
          className={cn(rowActionClass, map.touch ? "opacity-100" : "opacity-0")}
        >
          <Pencil className="size-3" />
        </button>
      </div>
    </li>
  );
}

// ── Lines ─────────────────────────────────────────────

function LinkLine({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<LinkEdge>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
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
  box: TreeBox,
  list: DocList,
} satisfies NodeTypes;

export const edgeTypes = { link: LinkLine } satisfies EdgeTypes;
