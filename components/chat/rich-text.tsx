import { Fragment, type ReactNode } from "react";

/**
 * Renders a translated string whose spans are marked with tags, e.g.
 * "Read the <terms>Terms</terms>" with { terms: (text) => <Link>…</Link> }.
 * Tags are flat (no nesting); an unknown tag renders its text as is.
 */
export function richText(
  template: string,
  tags: Record<string, (children: string) => ReactNode>
): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(template)) !== null) {
    if (match.index > cursor) out.push(template.slice(cursor, match.index));
    const render = tags[match[1]];
    out.push(<Fragment key={i++}>{render ? render(match[2]) : match[2]}</Fragment>);
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) out.push(template.slice(cursor));
  return out;
}
