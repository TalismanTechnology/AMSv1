/**
 * Validate candidate Blackbaud iCal feed URLs before creating feeds from them.
 *
 *   npx tsx scripts/check-ical-feed.ts <url> [url...]
 *   npx tsx scripts/check-ical-feed.ts --file urls.txt
 *
 * Checks each URL the same way the sync will: same normalisation, same SSRF
 * guard, same parser. A URL that passes here is one syncSchoolCalendars can
 * actually ingest — the common failure is a subscribe link that only works
 * while you are signed in, which returns an HTML login page instead of iCal.
 */
import ICAL from "ical.js";
import { fetchFeedText } from "@/lib/blackbaud/safe-fetch";

interface Report {
  url: string;
  ok: boolean;
  problem?: string;
  events?: number;
  recurring?: number;
  earliest?: string;
  latest?: string;
  categories?: string[];
  floatingTimes?: number;
}

function summarize(url: string, text: string): Report {
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    const looksLikeLogin = /<html|<!doctype/i.test(text);
    return {
      url,
      ok: false,
      problem: looksLikeLogin
        ? "returned HTML, not iCal — the link is probably session-bound, so the server cannot read it"
        : "no BEGIN:VCALENDAR in the response",
    };
  }

  const comp = new ICAL.Component(ICAL.parse(text));
  const vevents = comp.getAllSubcomponents("vevent");

  const categories = new Set<string>();
  let recurring = 0;
  let floatingTimes = 0;
  let earliest: ICAL.Time | null = null;
  let latest: ICAL.Time | null = null;

  for (const ve of vevents) {
    const event = new ICAL.Event(ve);
    if (event.isRecurring()) recurring += 1;

    // A DTSTART with neither TZID nor Z is "floating" and will be read in the
    // feed's configured timezone — worth surfacing so the right one is picked.
    const dtstart = ve.getFirstProperty("dtstart");
    const tzid = dtstart?.getParameter("tzid");
    const isUtc = dtstart?.getFirstValue()?.toString().endsWith("Z");
    if (!tzid && !isUtc && !event.startDate?.isDate) floatingTimes += 1;

    for (const prop of ve.getAllProperties("categories")) {
      for (const v of prop.getValues()) categories.add(String(v));
    }

    const start = event.startDate;
    if (start) {
      if (!earliest || start.compare(earliest) < 0) earliest = start;
      if (!latest || start.compare(latest) > 0) latest = start;
    }
  }

  return {
    url,
    ok: true,
    events: vevents.length,
    recurring,
    floatingTimes,
    earliest: earliest?.toJSDate().toISOString().slice(0, 10),
    latest: latest?.toJSDate().toISOString().slice(0, 10),
    categories: [...categories].sort(),
  };
}

async function check(url: string): Promise<Report> {
  try {
    const text = await fetchFeedText(url);
    return summarize(url, text);
  } catch (err) {
    return {
      url,
      ok: false,
      problem: err instanceof Error ? err.message : "unknown failure",
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  let urls: string[] = [];

  const fileFlag = args.indexOf("--file");
  if (fileFlag !== -1) {
    const fs = await import("node:fs");
    urls = fs
      .readFileSync(args[fileFlag + 1], "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } else {
    urls = args;
  }

  if (!urls.length) {
    console.error("usage: tsx scripts/check-ical-feed.ts <url>... | --file <path>");
    process.exit(1);
  }

  for (const url of urls) {
    const r = await check(url);
    console.log("─".repeat(72));
    console.log(r.url);

    if (!r.ok) {
      console.log(`  FAIL  ${r.problem}`);
      continue;
    }

    console.log(`  OK    ${r.events} events (${r.recurring} recurring)`);
    console.log(`        range: ${r.earliest} to ${r.latest}`);
    if (r.floatingTimes) {
      console.log(
        `        ${r.floatingTimes} event(s) with floating times — the feed's` +
          ` timezone setting decides what these mean`
      );
    }
    console.log(
      r.categories?.length
        ? `        categories: ${r.categories.join(", ")}`
        : `        categories: (none — auto-tagging will fall back to the AI)`
    );
  }
  console.log("─".repeat(72));
}

main();
