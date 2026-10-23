import type { Emphasis, Nodes, Parent, PhrasingContent, Root, Strong, Text } from "mdast";

// CommonMark only pairs ** when each side is "flanking": "**Note:**text",
// "said**“Hi”**", "**完了。**次" and similar stay literal because a
// punctuation mark sits next to a letter. After parsing, any ** left in the
// text is one the parser refused, so pair those up here and wrap what's
// between them in <strong> (and a lone *…* in <em>).

interface Marker {
  node: number;
  offset: number;
}

const WS = /\s/;
const MAX_EMPHASIS_LENGTH = 200;

function isText(node: unknown): node is Text {
  return !!node && (node as Text).type === "text";
}

function lastChar(node: PhrasingContent | undefined): string {
  if (!node) return "";
  return isText(node) ? node.value.slice(-1) : "x";
}

function firstChar(node: PhrasingContent | undefined): string {
  if (!node) return "";
  return isText(node) ? node.value[0] ?? "" : "x";
}

function findMarkers(children: PhrasingContent[], width: number): Marker[] {
  const markers: Marker[] = [];
  children.forEach((child, node) => {
    if (!isText(child)) return;
    const re = /\*+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(child.value)) !== null) {
      if (m[0].length === width) markers.push({ node, offset: m.index });
    }
  });
  return markers;
}

function charBefore(children: PhrasingContent[], m: Marker): string {
  const value = (children[m.node] as Text).value;
  return m.offset > 0 ? value[m.offset - 1] : lastChar(children[m.node - 1]);
}

function charAfter(children: PhrasingContent[], m: Marker, width: number): string {
  const value = (children[m.node] as Text).value;
  const at = m.offset + width;
  return at < value.length ? value[at] : firstChar(children[m.node + 1]);
}

function innerLength(children: PhrasingContent[], open: Marker, close: Marker, width: number): number {
  if (open.node === close.node) return close.offset - open.offset - width;
  let total = (children[open.node] as Text).value.length - open.offset - width + close.offset;
  for (let k = open.node + 1; k < close.node; k++) total += 1;
  return total;
}

function wrap(
  children: PhrasingContent[],
  open: Marker,
  close: Marker,
  width: number,
  type: "strong" | "emphasis"
): void {
  const a = children[open.node] as Text;
  const b = children[close.node] as Text;
  const before = a.value.slice(0, open.offset);
  const after = b.value.slice(close.offset + width);
  let inner: PhrasingContent[];
  if (open.node === close.node) {
    inner = [{ type: "text", value: a.value.slice(open.offset + width, close.offset) }];
  } else {
    inner = [
      { type: "text", value: a.value.slice(open.offset + width) },
      ...children.slice(open.node + 1, close.node),
      { type: "text", value: b.value.slice(0, close.offset) },
    ];
  }
  inner = inner.filter((n) => !isText(n) || n.value !== "");
  const wrapper = { type, children: inner } as Strong | Emphasis;
  const replacement: PhrasingContent[] = [];
  if (before) replacement.push({ type: "text", value: before });
  replacement.push(wrapper);
  if (after) replacement.push({ type: "text", value: after });
  children.splice(open.node, close.node - open.node + 1, ...replacement);
}

function repairOnce(children: PhrasingContent[], width: number, type: "strong" | "emphasis"): boolean {
  const markers = findMarkers(children, width);
  let open: Marker | null = null;
  for (const m of markers) {
    const prev = charBefore(children, m);
    const next = charAfter(children, m, width);
    const canClose = prev !== "" && !WS.test(prev);
    const canOpen = next !== "" && !WS.test(next);
    if (open && canClose) {
      const length = innerLength(children, open, m, width);
      const sameNode = open.node === m.node;
      const inline = sameNode && !(children[m.node] as Text).value.slice(open.offset, m.offset).includes("\n");
      // A lone * is more often literal ("Price*"), so only pair it tightly.
      if (length > 0 && (width === 2 || (inline && length <= MAX_EMPHASIS_LENGTH))) {
        wrap(children, open, m, width, type);
        return true;
      }
    }
    if (canOpen) open = m;
  }
  return false;
}

function walk(node: Nodes): void {
  if (node.type === "code" || node.type === "inlineCode" || node.type === "html") return;
  if (!("children" in node)) return;
  const children = (node as Parent).children as PhrasingContent[];
  if (children.some(isText)) {
    while (repairOnce(children, 2, "strong"));
    while (repairOnce(children, 1, "emphasis"));
  }
  for (const child of children) walk(child as Nodes);
}

/** remark plugin: wrap ** pairs the CommonMark parser left as text. */
export function remarkRepairEmphasis() {
  return (tree: Root) => {
    walk(tree);
  };
}
