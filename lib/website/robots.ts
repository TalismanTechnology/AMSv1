// Minimal robots.txt support (RFC 9309): user-agent groups, Allow/Disallow
// with `*` and `$` wildcards (longest match wins, Allow wins a tie),
// Crawl-delay, and Sitemap lines.

export const CRAWLER_TOKEN = "askmyschoolbot";
export const USER_AGENT = "AskMySchoolBot/1.0 (+https://askmyschool.ai)";

/** Never crawl faster than one request per second, whatever robots.txt says. */
export const MIN_CRAWL_DELAY_MS = 1_000;
/** A site asking for minutes between requests would never finish a sync. */
export const MAX_CRAWL_DELAY_MS = 60_000;

interface Rule {
  allow: boolean;
  pattern: string;
  re: RegExp;
}

export interface Robots {
  rules: Rule[];
  crawlDelaySeconds: number | null;
  sitemaps: string[];
}

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelay: number | null;
}

function compileRule(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

export function parseRobots(text: string | null | undefined): Robots {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  // Consecutive User-agent lines share one group; any rule line closes the
  // agent list so the next User-agent starts a new group.
  let collectingAgents = false;

  for (const rawLine of (text ?? "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }

    if (key === "user-agent") {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collectingAgents = true;
      continue;
    }

    if (!current) continue;
    collectingAgents = false;

    if (key === "allow" || key === "disallow") {
      // An empty Disallow means "allow everything" — no rule needed.
      if (!value) continue;
      current.rules.push({ allow: key === "allow", pattern: value, re: compileRule(value) });
    } else if (key === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
    }
  }

  // Our own group if one names us, else the `*` group. Multiple matching
  // groups are merged, per the RFC.
  const ours = groups.filter((g) => g.agents.some((a) => a.split("/")[0].trim() === CRAWLER_TOKEN));
  const chosen = ours.length ? ours : groups.filter((g) => g.agents.includes("*"));

  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelaySeconds: chosen.reduce<number | null>(
      (max, g) => (g.crawlDelay == null ? max : Math.max(max ?? 0, g.crawlDelay)),
      null
    ),
    sitemaps,
  };
}

/** May we fetch this URL? Path + query is what robots rules match against. */
export function isAllowedByRobots(robots: Robots, url: string): boolean {
  const u = new URL(url);
  const target = u.pathname + u.search;
  if (target === "/robots.txt") return true;

  let best: Rule | null = null;
  for (const rule of robots.rules) {
    if (!rule.re.test(target)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

export function crawlDelayMs(robots: Robots): number {
  const requested = (robots.crawlDelaySeconds ?? 0) * 1000;
  return Math.min(Math.max(requested, MIN_CRAWL_DELAY_MS), MAX_CRAWL_DELAY_MS);
}
